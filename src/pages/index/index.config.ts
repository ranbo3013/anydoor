export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: 'AnyDoor - AI 模型网关' })
  : { navigationBarTitleText: 'AnyDoor - AI 模型网关' }
