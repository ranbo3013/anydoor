export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: 'AI Gateway' })
  : { navigationBarTitleText: 'AI Gateway' }
