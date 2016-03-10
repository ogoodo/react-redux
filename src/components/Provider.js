import { Component, PropTypes, Children } from 'react'
import storeShape from '../utils/storeShape'

let didWarnAboutReceivingStore = false
function warnAboutReceivingStore() {
  if (didWarnAboutReceivingStore) {
    return
  }
  didWarnAboutReceivingStore = true

  /* eslint-disable no-console */
  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    console.error(
      '<Provider> does not support changing `store` on the fly. ' +
      'It is most likely that you see this error because you updated to ' +
      'Redux 2.x and React Redux 2.x which no longer hot reload reducers ' +
      'automatically. See https://github.com/rackt/react-redux/releases/' +
      'tag/v2.0.0 for the migration instructions.'
    )
  }
  /* eslint-disable no-console */
}

/**
 * Provider也是一个react组建
 */
export default class Provider extends Component {
  //将store传递给子控件使用
  //子控件通过 this.context.store这样子引用
  //可以跨越多层子控件, 如果多个父控件有相同属性, 会返回离子控件最近的
  //可以参考: https://segmentfault.com/a/1190000002878442
  getChildContext() {
    return { store: this.store }
  }

  /**
   * 以下调用时会传入store
   * <Provider store={store}>
   *    <App />
   * </Provider>
   */
  constructor(props, context) {
    super(props, context)
    this.store = props.store
  }

  /**
   * 自生不做渲染, 直接返回子节点(仅一个子节点)
   */
  render() {
    const { children } = this.props
    return Children.only(children)
  }
}

if (process.env.NODE_ENV !== 'production') {
  Provider.prototype.componentWillReceiveProps = function (nextProps) {
    const { store } = this
    const { store: nextStore } = nextProps

    if (store !== nextStore) {
      warnAboutReceivingStore()
    }
  }
}

Provider.propTypes = {
  store: storeShape.isRequired,
  children: PropTypes.element.isRequired
}

/**
 * getChildContext 指定的传递给子组件的属性需要先通过 childContextTypes 来指定，不然会产生错误
 */
Provider.childContextTypes = {
  store: storeShape.isRequired
}
