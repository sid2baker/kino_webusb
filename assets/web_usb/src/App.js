import React, {
  useEffect,
  useRef,
  useState,
  useContext,
  createContext,
} from "react";
import {
  RiUsbLine,
  RiRefreshLine,
  RiCloseLine,
  RiFolderOpenLine,
} from "@remixicon/react";
import classNames from "classnames";

function createDeviceId(device) {
  let id = `${device.vendorId}-${device.productId}`;
  if (device.serialNumber) {
    id = id + `-${device.serialNumber}`;
  }
  return id;
}

async function getDeviceList() {
  const deviceArray = await navigator.usb.getDevices();
  const devices = deviceArray.reduce((acc, device) => {
    const id = createDeviceId(device);
    acc[id] = device;
    return acc;
  }, {});
  return devices;
}

async function getDeviceById(id) {
  const deviceDict = await getDeviceList();
  const device = deviceDict[id] || null;
  return device;
}

function getClaimedInterfaceNumbers(config) {
  const claimedInterfaces = config.interfaces.filter((iface) => iface.claimed);
  return claimedInterfaces.map((iface) => iface.interfaceNumber);
}

function getClaimedEndpoints(config) {
  if (config === null) {
    return [];
  }

  const claimedInterfaces = config.interfaces.filter((iface) => iface.claimed);
  const endpoints = claimedInterfaces.reduce((acc, iface) => {
    const endpoints = iface.alternate.endpoints.map((endpoint) => {
      return {
        interface: iface.interfaceNumber,
        endpoint: endpoint.endpointNumber,
        direction: endpoint.direction,
        type: endpoint.type,
        packetSize: endpoint.packetSize,
      };
    });
    return acc.concat(...endpoints);
  }, []);
  return endpoints;
}

function withTimeout(promise, seconds = 5) {
  let timeout = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation timed out after ${seconds} seconds`));
    }, seconds * 1000);
  });
  return Promise.race([promise, timeout]);
}

const WebUSBContext = createContext();
const LoggerContext = createContext();

function LoggerProvider({ children }) {
  const [logs, setLogs] = useState([]);

  const log = (...args) => {
    console.log(...args);
    const message = args.join(" ");
    setLogs((prevLogs) => [
      ...prevLogs,
      { type: "info", message: message, timestamp: new Date().toISOString() },
    ]);
  };

  const logError = (...args) => {
    console.error(...args);
    const errorMessage = args.join(" ");
    setLogs((prevLogs) => [
      ...prevLogs,
      {
        type: "error",
        message: errorMessage,
        timestamp: new Date().toDateString(),
      },
    ]);
  };

  return (
    <LoggerContext.Provider value={{ logs, log, logError }}>
      {children}
    </LoggerContext.Provider>
  );
}

const useLogger = () => {
  const context = useContext(LoggerContext);
  if (!context) {
    throw new Error("useLogger must be used within a LoggerProvider");
  }
  return context;
};

const useDevice = () => {
  const context = useContext(WebUSBContext);
  if (!context) {
    throw new Error("useDevice must be used within a WebUSBProvider");
  }
  return context;
};

export default function App({ ctx, payload }) {
  return (
    <LoggerProvider>
      <WebUSBComponent ctx={ctx} payload={payload} />
    </LoggerProvider>
  );
}

function WebUSBComponent({ ctx, payload }) {
  const openedDeviceRef = useRef(null);
  const [openedDevice, setOpenedDevice] = useState(null);
  const [deviceList, setDeviceList] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const { log, logError } = useLogger();

  const updateDevice = () => {
    const d = openedDeviceRef.current;
    const configurations = d.configurations.map((config, index) => ({
      name: config.configurationName,
      value: config.configurationValue,
      active: d.configuration.configurationValue == config.configurationValue,
      interfaces: config.interfaces.map((iface, index) => ({
        number: iface.interfaceNumber,
        claimed: iface.claimed,
        name: iface.alternate.interfaceName,
        class: iface.alternate.interfaceClass,
        subclass: iface.alternate.interfaceSubclass,
        protocol: iface.alternate.interfaceProtocol,
      })),
    }));

    const updatedDevice = {
      configurations: configurations,
      availableEndpoints: getClaimedEndpoints(d.configuration),
      productName: d.productName,
      manufacturerName: d.manufacturerName,
      serialNumber: d.serialNumber,
      vendorId: d.vendorId,
      productId: d.productId,
      baseClass: d.deviceClass,
      subClass: d.deviceSubclass,
      protocol: d.deviceProtocol,
      version:
        d.deviceVersionMajor +
        "." +
        d.deviceVersionMinor +
        "." +
        d.deviceVersionSubminor,
      usbVersion:
        d.usbVersionMajor +
        "." +
        d.usbVersionMinor +
        "." +
        d.usbVersionSubminor,
    };
    console.log("Updated:", updatedDevice);
    setOpenedDevice(updatedDevice);
    ctx.pushEvent("device_update", {
      id: createDeviceId(d),
      selectedConfiguration: d.configuration.configurationValue,
      claimedInterfaces: getClaimedInterfaceNumbers(d.configuration),
    });
  };

  const handleRequestDevice = async () => {
    try {
      const device = await navigator.usb.requestDevice({ filters: [] });
      log("Device connected:", device);
      await handleGetDeviceList();
      setSelectedDevice(createDeviceId(device));
    } catch (error) {
      logError("Error connecting to the device:", error);
    }
  };

  const handleGetDeviceList = async () => {
    const deviceListDict = await getDeviceList();
    const deviceList = Object.entries(deviceListDict).map(([id, device]) => {
      return { id: id, name: device.productName || "Unknown Device" };
    });
    setDeviceList(deviceList);
  };

  const handleOpenDevice = async () => {
    try {
      const device = await getDeviceById(selectedDevice);
      await device.open();
      log("Device opened:", device);
      openedDeviceRef.current = device;
      updateDevice();
    } catch (error) {
      logError("Error openeing the device:", error);
    }
  };

  const handleCloseDevice = async () => {
    if (!openedDeviceRef.current) return;

    try {
      await openedDeviceRef.current.close();
      log("Device closed:", openedDeviceRef.current);
      ctx.pushEvent("device_closed", selectedDevice);
      openedDeviceRef.current = null;
      setOpenedDevice(null);
    } catch (error) {
      logError("Error closing the device:", error);
    }
  };

  useEffect(() => {
    navigator.usb.addEventListener("connect", async (event) => {
      log("Device connected", event.device);
      await handleGetDeviceList();
      ctx.pushEvent("device_connected", createDeviceId(event.device));
    });

    navigator.usb.addEventListener("disconnect", async (event) => {
      log("Device disconnected", event.device);
      await handleGetDeviceList();
      ctx.pushEvent("device_disconnected", createDeviceId(event.device));
    });

    ctx.handleEvent("open_device", async ({ id, config }) => {
      try {
        await handleGetDeviceList();
        setSelectedDevice(id);
        const device = await getDeviceById(id);
        await device.open();
        await device.selectConfiguration(config.selected_configuration);
        await Promise.all(
          config.claimed_interfaces.map(async (iface) => {
            await device.claimInterface(iface);
          }),
        );
        openedDeviceRef.current = device;
        updateDevice();
      } catch (error) {
        logError("Can't open device", error);
      }
    });
    ctx.handleEvent("get_endpoints", () => {
      if (openedDeviceRef.current) {
        ctx.pushEvent("device_response", [
          "ok",
          getClaimedEndpoints(openedDeviceRef.current.configuration),
        ]);
      } else {
        ctx.pushEvent("device_response", ["error", "No opened device"]);
      }
    });
    ctx.handleEvent("transfer_out", async ([endpoint, data]) => {
      try {
        await withTimeout(
          openedDeviceRef.current.transferOut(endpoint, data),
          3,
        );
        ctx.pushEvent("device_response", "ok");
      } catch (error) {
        ctx.pushEvent("device_response", ["error", error.message]);
      }
    });
    ctx.handleEvent("transfer_in", async ({ endpoint, length }) => {
      try {
        const response = await withTimeout(
          openedDeviceRef.current.transferIn(endpoint, length),
          3,
        );
        ctx.pushEvent("device_response", ["ok", response.data.buffer]);
      } catch (error) {
        ctx.pushEvent("device_response", ["error", error.message]);
      }
    });

    handleGetDeviceList();
  }, []);

  return (
    <WebUSBContext.Provider
      value={{ openedDeviceRef, openedDevice, updateDevice }}
    >
      <Header>
        {!openedDevice && (
          <HeaderButton onClick={handleRequestDevice}>
            <RiUsbLine size={24} />
          </HeaderButton>
        )}
        <HeaderButton onClick={handleGetDeviceList}>
          <RiRefreshLine size={24} />
        </HeaderButton>
        <div className="grow" />
        <DeviceSelectionComponent
          deviceIsOpened={openedDevice != null}
          deviceList={deviceList}
          selectedDevice={selectedDevice}
          onDeviceSelectChange={(value) => setSelectedDevice(value)}
        />
        {openedDevice ? (
          <HeaderButton onClick={handleCloseDevice}>
            <RiCloseLine size={24} />
          </HeaderButton>
        ) : (
          <HeaderButton onClick={handleOpenDevice}>
            <RiFolderOpenLine size={24} />
          </HeaderButton>
        )}
      </Header>
      <Body>
        {openedDevice ? (
          <OpenedDeviceViewer device={openedDevice} />
        ) : (
          <p>Basic Information</p>
        )}
        <Logger />
      </Body>
    </WebUSBContext.Provider>
  );

  function Body({ children }) {
    return (
      <div className="bg-400-green flex flex-col rounded-b-lg border border-gray-300">
        {children}
      </div>
    );
  }

  function Header({ children }) {
    return (
      <div className="flex flex-wrap justify-start gap-4 rounded-t-lg border border-gray-300 bg-blue-100">
        {children}
      </div>
    );
  }

  function HeaderButton({ children, onClick }) {
    return (
      <button
        onClick={() => onClick()}
        className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-800"
      >
        {children}
      </button>
    );
  }

  function DeviceSelectionComponent({
    deviceIsOpened,
    deviceList,
    selectedDevice,
    onDeviceSelectChange,
  }) {
    return (
      <select
        disabled={deviceIsOpened}
        value={selectedDevice}
        onChange={(e) => onDeviceSelectChange(e.target.value)}
        className="rounded-md border-gray-300 shadow-sm"
      >
        <option value="">Select a device</option>
        {deviceList.map(({ id, name }) => (
          <option key={id} value={id} className="border-b border-gray-200 py-2">
            {name}
          </option>
        ))}
      </select>
    );
  }

  function OpenedDeviceViewer({ device }) {
    return (
      <div>
        <DeviceInfo device={device} />
        <ConfigurationSelectionComponent
          configurations={device.configurations}
        />
      </div>
    );
  }

  function DeviceInfo({ device }) {
    const vid =
      "0x" + device.vendorId.toString(16).toUpperCase().padStart(4, "0");
    const pid =
      "0x" + device.productId.toString(16).toUpperCase().padStart(4, "0");

    return (
      <div className="bg-gray-200">
        <div className="flex-row gap-4">
          <div className="flex gap-4">
            <div>{device.productName}</div>
            <div>{device.manufacturerName}</div>
            <div>{device.serialNumber}</div>
          </div>
          <div className="flex gap-4">
            <div>{vid + ":" + pid}</div>
          </div>
          <div>
            <a href="https://www.usb.org/defined-class-codes">
              Device Class Code
            </a>
            : {device.baseClass}.{device.subClass}.{device.protocol}
          </div>
          <div className="flex gap-4">
            <div>Version: {device.version}</div>
            <div>USB Version: {device.usbVersion}</div>
          </div>
        </div>
      </div>
    );
  }

  function ConfigurationSelectionComponent({ configurations }) {
    const { openedDeviceRef, openedDevice, updateDevice } = useDevice();

    const handleTabClick = async (number) => {
      await openedDeviceRef.current.selectConfiguration(number);
      updateDevice();
    };

    return (
      <div>
        <div className="flex border-b">
          {configurations.map((config, index) => (
            <ConfigurationTab
              key={index}
              active={config.active}
              onClick={() => handleTabClick(config.value)}
            />
          ))}
        </div>
        <div>
          {configurations.map(
            (config, index) =>
              config.active && (
                <ConfigurationViewer key={index} configuration={config} />
              ),
          )}
        </div>
      </div>
    );
  }

  function ConfigurationTab({ children, active, onClick }) {
    const activeStyles = active
      ? "border-b-2 border-blue-500"
      : "text-gray-500 hover:text-black";
    return (
      <button className={`px-4 py-2 ${activeStyles}`} onClick={onClick}>
        {children}
      </button>
    );
  }

  function ConfigurationViewer({ configuration }) {
    return (
      <div
        className={`flex-col ${configuration.active ? "bg-green-200" : "bg-gray-400"}`}
      >
        <div>{configuration.name || "Config " + configuration.value}</div>
        <div className="flex-row bg-gray-300">
          {configuration.interfaces.map((iface, index) => (
            <InterfaceViewer key={index} iface={iface} />
          ))}
        </div>
      </div>
    );
  }

  function InterfaceViewer({ iface }) {
    const { openedDeviceRef, openedDevice, updateDevice } = useDevice();

    const handleClaimInterface = async (event) => {
      const number = event.target.value;
      await openedDeviceRef.current.claimInterface(number);
      updateDevice();
    };

    const handleReleaseInterface = async (event) => {
      const number = event.target.value;
      await openedDeviceRef.current.releaseInterface(number);
      updateDevice();
    };

    return (
      <button
        value={iface.number}
        onClick={iface.claimed ? handleReleaseInterface : handleClaimInterface}
        className={`w-12 ${iface.claimed ? "bg-green-400" : "bg-gray-400"}`}
      >
        {iface.number}
      </button>
    );
  }

  function Logger() {
    const { logs } = useLogger();

    return (
      <div>
        <h2>Logs</h2>
        <ul>
          {logs.map((log, index) => (
            <li key={index}>{`${log.timestamp}: ${log.message}`}</li>
          ))}
        </ul>
      </div>
    );
  }
}
