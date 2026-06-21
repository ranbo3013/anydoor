export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: 'AI 模型网关' })
  : { navigationBarTitleText: 'AI 模型网关' }
