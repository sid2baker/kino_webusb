defmodule KinoWebUSB.MixProject do
  use Mix.Project

  def project do
    [
      app: :kino_webusb,
      version: "0.1.0",
      elixir: "~> 1.15",
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  # Run "mix help compile.app" to learn about applications.
  def application do
    [
      extra_applications: [:logger]
    ]
  end

  # Run "mix help deps" to learn about dependencies.
  defp deps do
    [
      {:kino, "~> 0.12.3"},
      {:ex_doc, ">= 0.0.0", only: :dev, runtime: false}
    ]
  end
end
