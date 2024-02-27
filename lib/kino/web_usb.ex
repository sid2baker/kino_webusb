defmodule Kino.WebUSB do
  use Kino.JS, assets_path: "lib/assets/web_usb/build"
  use Kino.JS.Live

  def new do
    Kino.JS.Live.new(__MODULE__, nil)
  end

  def open_device(device, device_id, device_config) do
    Kino.JS.Live.cast(device, {:open_device, device_id, device_config})
  end

  def info(device) do
    Kino.JS.Live.call(device, :info)
  end

  def get_endpoints(device) do
    Kino.JS.Live.call(device, :get_endpoints)
  end

  def transfer_out(device, endpoint, data) do
    Kino.JS.Live.call(device, {:transfer_out, endpoint, data})
  end

  def transfer_in(device, endpoint, length) do
    Kino.JS.Live.call(device, {:transfer_in, endpoint, length})
  end

  @impl true
  def init(nil, ctx) do
    {:ok, assign(ctx, caller: nil, client_id: nil, device_id: nil, device_status: :disconnected, device_config: %{})}
  end

  @impl true
  def handle_connect(ctx) do
    {:ok, %{}, assign(ctx, client_id: ctx.origin)}
  end

  @impl true
  def handle_cast({:open_device, device_id, device_config}, ctx) do
    send_event(ctx, ctx.assigns.client_id, "open_device", %{id: device_id, config: device_config})
    {:noreply, ctx}
  end

  @impl true
  def handle_call(:info, _from, ctx) do
    if ctx.assigns.device_id do
      info =
        ctx.assigns.device_config
        |> Map.put(:id, ctx.assigns.device_id)
        |> Map.put(:status, ctx.assigns.device_status)
      {:reply, {:ok, info}, ctx}
    else
      {:reply, {:error, "No opened device"}, ctx}
    end
  end
  
  @impl true
  def handle_call(:get_endpoints, from, ctx) do
    send_event(ctx, ctx.assigns.client_id, "get_endpoints", nil)
    {:noreply, assign(ctx, caller: from)}
  end

  @impl true
  def handle_call({:transfer_out, endpoint, data}, from, ctx) do
    send_event(ctx, ctx.assigns.client_id, "transfer_out", {:binary, endpoint, data})
    {:noreply, assign(ctx, caller: from)}
  end

  @impl true
  def handle_call({:transfer_in, endpoint, length}, from, ctx) do
    send_event(ctx, ctx.assigns.client_id, "transfer_in", %{endpoint: endpoint, length: length})
    {:noreply, assign(ctx, caller: from)}
  end

  @impl true
  def handle_event("device_response", data, ctx) do
    if ctx.assigns.caller do
      case data do
        "ok" -> Kino.JS.Live.reply(ctx.assigns.caller, :ok)
        ["ok", data] -> Kino.JS.Live.reply(ctx.assigns.caller, {:ok, data})
        {:binary, "ok", binary} -> Kino.JS.Live.reply(ctx.assigns.caller, {:ok, binary})
        ["error", error] -> Kino.JS.Live.reply(ctx.assigns.caller, {:error, error})
      end
    end

    {:noreply, assign(ctx, caller: nil)}
  end

  @impl true
  def handle_event("device_update", %{"id" => id, "selectedConfiguration" => config, "claimedInterfaces" => interfaces}, ctx) do
    ctx = assign(ctx, device_id: id, device_status: :connected, device_config: %{selected_configuration: config, claimed_interfaces: interfaces})
    {:noreply, ctx}
  end

  @impl true
  def handle_event("device_closed", device_id, ctx) do
    if device_id == ctx.assigns.device_id do
      {:noreply, assign(ctx, device_id: nil, device_status: :disconnected, device_config: %{})}
    else
      {:noreply, ctx}
    end
  end

  @impl true
  def handle_event("device_connected", device_id, ctx) do
    # try to reconnect configured device
    if ctx.assigns.device_id == device_id and ctx.assigns.device_status == :disconnected do
      send_event(ctx, ctx.assigns.client_id, "open_device", %{id: ctx.assigns.device_id, config: ctx.assigns.device_config})
      {:noreply, ctx}
    else
      {:noreply, ctx}
    end
  end

  @impl true
  def handle_event("device_disconnected", device_id, ctx) do
    if ctx.assigns.device_id == device_id do
      ctx = assign(ctx, device_status: :disconnected)
      {:noreply, ctx}
    else
      {:noreply, ctx}
    end
  end
end
