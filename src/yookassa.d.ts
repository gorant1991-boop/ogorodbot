interface YooMoneyCheckoutWidgetInstance {
  render: (target: string | HTMLElement) => void
  destroy?: () => void
}

interface YooMoneyCheckoutWidgetOptions {
  confirmation_token: string
  return_url: string
  error_callback?: (error: unknown) => void
}

interface Window {
  YooMoneyCheckoutWidget?: new (options: YooMoneyCheckoutWidgetOptions) => YooMoneyCheckoutWidgetInstance
}
