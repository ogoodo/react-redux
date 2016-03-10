import { Component, createElement } from 'react'
import storeShape from '../utils/storeShape'
import shallowEqual from '../utils/shallowEqual'
import wrapActionCreators from '../utils/wrapActionCreators'
import isPlainObject from 'lodash/isPlainObject'
import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'

const defaultMapStateToProps = state => ({}) // eslint-disable-line no-unused-vars
const defaultMapDispatchToProps = dispatch => ({ dispatch })
const defaultMergeProps = (stateProps, dispatchProps, parentProps) => ({
  ...parentProps,
  ...stateProps,
  ...dispatchProps
})

function getDisplayName(WrappedComponent) {
  return WrappedComponent.displayName || WrappedComponent.name || 'Component'
}

/**
 * 检测stateProps是否是纯对象
 * 如果不是invariant函数会抛出一个错误
 */
function checkStateShape(stateProps, dispatch) {
  invariant(
    isPlainObject(stateProps),
    '`%sToProps` must return an object. Instead received %s.',
    dispatch ? 'mapDispatch' : 'mapState',
    stateProps
  )
  return stateProps
}

// Helps track hot reloading.
let nextVersion = 0

/**
 * 
 * @param mergeProps[function][可选] stateProps, dispatchProps, parentProps将这3个合并成一个的函数
 */
export default function connect(mapStateToProps, mapDispatchToProps, mergeProps, options = {}) {
  const shouldSubscribe = Boolean(mapStateToProps)
  const mapState = mapStateToProps || defaultMapStateToProps
  const mapDispatch = isPlainObject(mapDispatchToProps) ?
    wrapActionCreators(mapDispatchToProps) :
    mapDispatchToProps || defaultMapDispatchToProps

  const finalMergeProps = mergeProps || defaultMergeProps
  const checkMergedEquals = finalMergeProps !== defaultMergeProps
  const { pure = true, withRef = false } = options

  // Helps track hot reloading.
  const version = nextVersion++

  //合并3成1， 并判断接口是否是纯对象
  function computeMergedProps(stateProps, dispatchProps, parentProps) {
    const mergedProps = finalMergeProps(stateProps, dispatchProps, parentProps)
    invariant(
      isPlainObject(mergedProps),
      '`mergeProps` must return an object. Instead received %s.',
      mergedProps
    )
    return mergedProps
  }

  /**
   * 调用此函数, 返回一包装在上下文的类
   */
  return function wrapWithConnect(WrappedComponent) {
    class Connect extends Component {
      shouldComponentUpdate() {
        return !pure || this.haveOwnPropsChanged || this.hasStoreStateChanged
      }

      constructor(props, context) {
        super(props, context)
        this.version = version
        this.store = props.store || context.store

        invariant(this.store,
          `Could not find "store" in either the context or ` +
          `props of "${this.constructor.displayName}". ` +
          `Either wrap the root component in a <Provider>, ` +
          `or explicitly pass "store" as a prop to "${this.constructor.displayName}".`
        )

        const storeState = this.store.getState()
        this.state = { storeState }
        this.clearCache()
      }

      computeStateProps(store, props) {
        //这个地方写得有点绕, 主要是configureFinalMapState可能会嵌套调用computeStateProps增加了复杂度
        if (!this.finalMapStateToProps) {
          return this.configureFinalMapState(store, props)
        }

        const state = store.getState()
        const stateProps = this.doStatePropsDependOnOwnProps ?
          this.finalMapStateToProps(state, props) :
          this.finalMapStateToProps(state)

        return checkStateShape(stateProps)
      }
      //仅供computeStateProps调用
      configureFinalMapState(store, props) {
        //mapState是connect传入的或是默认的state转props函数(一般来说是)
        const mappedState = mapState(store.getState(), props)
        const isFactory = typeof mappedState === 'function'

        //最终用它将state转传子props
        this.finalMapStateToProps = isFactory ? mappedState : mapState
        this.doStatePropsDependOnOwnProps = this.finalMapStateToProps.length !== 1

        //connect(@mapStateToProps参数是函数,返回第一表达式结果,否则返回第二表达式结果
        return isFactory ?
          this.computeStateProps(store, props) :
          checkStateShape(mappedState)
      }

      //类似 computeStateProps
      computeDispatchProps(store, props) {
        if (!this.finalMapDispatchToProps) {
          return this.configureFinalMapDispatch(store, props)
        }

        const { dispatch } = store
        const dispatchProps = this.doDispatchPropsDependOnOwnProps ?
          this.finalMapDispatchToProps(dispatch, props) :
          this.finalMapDispatchToProps(dispatch)

        return checkStateShape(dispatchProps, true)
      }

      //类似 configureFinalMapState
      configureFinalMapDispatch(store, props) {
        const mappedDispatch = mapDispatch(store.dispatch, props)
        const isFactory = typeof mappedDispatch === 'function'

        this.finalMapDispatchToProps = isFactory ? mappedDispatch : mapDispatch
        this.doDispatchPropsDependOnOwnProps = this.finalMapDispatchToProps.length !== 1

        return isFactory ?
          this.computeDispatchProps(store, props) :
          checkStateShape(mappedDispatch, true)
      }

      /**
       * 从state根据connect的第一个参数(一个转换函数)生成一个传递给子控件的props
       */
      updateStatePropsIfNeeded() {
        const nextStateProps = this.computeStateProps(this.store, this.props)
        //如果没变化就不做更新
        if (this.stateProps && shallowEqual(nextStateProps, this.stateProps)) {
          return false
        }

        this.stateProps = nextStateProps
        return true
      }
      
      //类似 updateStatePropsIfNeeded
      updateDispatchPropsIfNeeded() {
        const nextDispatchProps = this.computeDispatchProps(this.store, this.props)
        if (this.dispatchProps && shallowEqual(nextDispatchProps, this.dispatchProps)) {
          return false
        }

        this.dispatchProps = nextDispatchProps
        return true
      }

      /**
       * 将connect传递过来参数一参数二生成的2个obj及父传过来的props, 3个东东合并成一个给子控件传过去(如果需要)
       */
      updateMergedPropsIfNeeded() {
        const nextMergedProps = computeMergedProps(this.stateProps, this.dispatchProps, this.props)
        if (this.mergedProps && checkMergedEquals && shallowEqual(nextMergedProps, this.mergedProps)) {
          return false
        }

        this.mergedProps = nextMergedProps
        return true
      }

      isSubscribed() {
        return typeof this.unsubscribe === 'function'
      }

      //订阅stor改变消息
      trySubscribe() {
        if (shouldSubscribe && !this.unsubscribe) {
          this.unsubscribe = this.store.subscribe(this.handleChange.bind(this))
          this.handleChange()
        }
      }

      tryUnsubscribe() {
        if (this.unsubscribe) {
          this.unsubscribe()
          this.unsubscribe = null
        }
      }

      //组建装载, 订阅stor改变消息
      componentDidMount() {
        this.trySubscribe()
      }

      componentWillReceiveProps(nextProps) {
        if (!pure || !shallowEqual(nextProps, this.props)) {
          this.haveOwnPropsChanged = true
        }
      }

      componentWillUnmount() {
        this.tryUnsubscribe()
        this.clearCache()
      }

      clearCache() {
        this.dispatchProps = null
        this.stateProps = null
        this.mergedProps = null
        this.haveOwnPropsChanged = true
        this.hasStoreStateChanged = true
        this.renderedElement = null
        this.finalMapDispatchToProps = null
        this.finalMapStateToProps = null
      }

      //store内容改变， 会调用这个函数, 有订阅
      handleChange() {
        if (!this.unsubscribe) {
          return
        }

        const prevStoreState = this.state.storeState
        const storeState = this.store.getState()

        if (!pure || prevStoreState !== storeState) {
          this.hasStoreStateChanged = true
          //这句会触发本类的render函数
          this.setState({ storeState })
        }
      }

      getWrappedInstance() {
        invariant(withRef,
          `To access the wrapped instance, you need to specify ` +
          `{ withRef: true } as the fourth argument of the connect() call.`
        )

        return this.refs.wrappedInstance
      }
      /**
       * 自生不会渲染出界面元件, 会计算出包裹React类需要的数据， 然后渲染出界面元件返回
       */
      render() {
        const {
          haveOwnPropsChanged,
          hasStoreStateChanged,
          renderedElement
        } = this

        this.haveOwnPropsChanged = false
        this.hasStoreStateChanged = false

        let shouldUpdateStateProps = true
        let shouldUpdateDispatchProps = true
        if (pure && renderedElement) {
          shouldUpdateStateProps = hasStoreStateChanged || (
            haveOwnPropsChanged && this.doStatePropsDependOnOwnProps
          )
          shouldUpdateDispatchProps =
            haveOwnPropsChanged && this.doDispatchPropsDependOnOwnProps
        }

        //根据connect(mapStateToProps 这个参数(是函数), 将state转换为传给子控件的props, 和老的对比是否有改变
        //总的来说就是, 传给子的props中的state转换部分有没有变化
        let haveStatePropsChanged = false   
        let haveDispatchPropsChanged = false
        if (shouldUpdateStateProps) {
          haveStatePropsChanged = this.updateStatePropsIfNeeded()
        }
        if (shouldUpdateDispatchProps) {
          haveDispatchPropsChanged = this.updateDispatchPropsIfNeeded()
        }

        //3个是否有合并成一个，或者合并后是否相对老的有改动
        //(总数据是否变动开关)
        let haveMergedPropsChanged = true
        if (
          haveStatePropsChanged ||
          haveDispatchPropsChanged ||
          //haveOwnPropsChanged在componentWillReceiveProps函数里会设定为true
          haveOwnPropsChanged
        ) {
          haveMergedPropsChanged = this.updateMergedPropsIfNeeded()
        } else {
          haveMergedPropsChanged = false
        }

        //如果数据都没变动, 又存在了渲染的老元件, 那就返回老元件就行了******
        if (!haveMergedPropsChanged && renderedElement) {
          return renderedElement
        }

        //这个开关是connect函数传递进来的
        if (withRef) {
          // 传递给子控件的数据, 都是通过this.mergedProps他传的      重点      重点      重点
          this.renderedElement = createElement(WrappedComponent, {
            ...this.mergedProps,
            ref: 'wrappedInstance'
          })
        } else {
          this.renderedElement = createElement(WrappedComponent,
            this.mergedProps
          )
        }

        return this.renderedElement
      }
    }

    Connect.displayName = `Connect(${getDisplayName(WrappedComponent)})`
    Connect.WrappedComponent = WrappedComponent
    //引用父元件数据需要申明
    //this.context.store 这样子引用
    Connect.contextTypes = {
      store: storeShape
    }
    //这个会传递些什么值来， 还没确定          看          看          看
    Connect.propTypes = {
      store: storeShape
    }

    if (process.env.NODE_ENV !== 'production') {
      Connect.prototype.componentWillUpdate = function componentWillUpdate() {
        if (this.version === version) {
          return
        }

        // We are hot reloading!
        this.version = version
        this.trySubscribe()
        this.clearCache()
      }
    }

    return hoistStatics(Connect, WrappedComponent)
  }
}
