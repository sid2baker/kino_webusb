defmodule Kino.WebUSB do
  use Kino.JS, assets_path: "lib/assets/web_usb/build"
  use Kino.JS.Live

  def new do
    Kino.JS.Live.new(__MODULE__, nil)
  end

  def get_endpoints(device) do
    Kino.JS.Live.call(device, :get_endpoints)
  end

  def send(device, endpoint, data, opts \\ []) do
    response_length = Keyword.get(opts, :response_length, 64)

    Kino.JS.Live.call(device, {:send, endpoint, data, response_length})
  end

  def transfer_out(device, endpoint, data) do
    Kino.JS.Live.call(device, {:transfer_out, endpoint, data})
  end

  def transfer_in(device, endpoint, length) do
    Kino.JS.Live.call(device, {:transfer_in, endpoint, length})
  end

  @impl true
  def init(nil, ctx) do
    {:ok, assign(ctx, caller: nil, client_id: nil)}
  end

  @impl true
  def handle_connect(ctx) do
    {:ok, %{}, assign(ctx, client_id: ctx.origin)}
  end

  @impl true
  def handle_call(:get_endpoints, from, ctx) do
    send_event(ctx, ctx.assigns.client_id, "get_endpoints", nil)
    {:noreply, assign(ctx, caller: from)}
  end

  @impl true
  def handle_call({:send, endpoint, data, response_length}, from, ctx) do
    send_event(ctx, ctx.assigns.client_id, "send", {:binary, %{endpoint: endpoint, response_length: response_length}, data})
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
        ["error", error] -> Kino.JS.Live.reply(ctx.assigns.caller, {:error, error})
      end
    end

    {:noreply, assign(ctx, caller: nil)}
  end
end