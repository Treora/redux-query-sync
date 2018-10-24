# redux-query-sync

Treat the URL query parameters as exposed variables of your [Redux][] state. For example,
`/mypage.html?p=14` could correspond to a state object containing `{pageNumber: 14}`.

Any changes to the store state are reflected in the URL. Vice versa, if the URL is changed using the
[`history`](history) module, the changed parameters are updated in the store state.

[Redux]: http://redux.js.org/
[React Router]: https://reacttraining.com/react-router/

## Alternatives

Similar modules exist, which you might prefer in some scenarios:

- If you already use [React Router][], also have a look at [react-router-redux-sync][]. If you prefer combining React Router with redux-query-sync, ensure you pass them the same `history` instance (see this [explanation](https://github.com/Treora/redux-query-sync/issues/13#issuecomment-327361957)).
- If you use React without Redux, try [react-url-query][].

Otherwise, keep reading.

[react-router-redux-sync]: https://github.com/scienceai/react-router-redux-sync
[react-url-query]: https://github.com/pbeshai/react-url-query

## Install

```
npm install redux-query-sync
```

## Usage

As a minimal example, let's say we want to synchronise query parameter `dest` with the value of the
state's `route.destination` field, to parse/make URLs such as `directions.html?dest=Amsterdam`.

**Minimal example**
```js
import ReduxQuerySync from 'redux-query-sync'

ReduxQuerySync({
    store, // your Redux store
    params: {
        dest: {
            // The selector you use to get the destination string from the state object.
            selector: state => state.route.destination,
            // The action creator you use for setting a new destination.
            action: value => ({type: 'setDestination', payload: value}),
        },
    },
    // Initially set the store's state to the current location.
    initialTruth: 'location',
})
```

Note that redux-query-sync does not modify the state, but lets you specify which action to dispatch
when the state should be updated. It does modify the location (using
history.[pushState][]/[replaceState][]), but ensures to only touch the parameters you specified.

[pushState]: https://developer.mozilla.org/en-US/docs/Web/API/History_API#The_pushState()_method
[replaceState]: https://developer.mozilla.org/en-US/docs/Web/API/History_API#The_replaceState()_method

Let's look at a more elaborate example now. We sync the query parameter `p` with the value of the
state's `pageNumber` field, which includes a mapping between string and integer.

**Full example**
```js
import ReduxQuerySync from 'redux-query-sync'

ReduxQuerySync({
    store,
    params: {
        p: {
            selector: state => state.pageNumber,
            action: value => ({type: 'setPageNumber', payload: value}),

            // Cast the parameter value to a number (we map invalid values to 1, which will then
            // hide the parameter).
            stringToValue: string => Number.parseInt(string) || 1,

            // We then also specify the inverse function (this example one is the default)
            valueToString: value => `${value}`,

            // When state.pageNumber equals 1, the parameter p is hidden (and vice versa).
            defaultValue: 1,
        },
        selection: {
            selector: state => state.selection,
            action: value => ({type: 'setSelection', payload: value}),

            // Cast each value to a number
            stringToValue: string => Number.parseInt(string) || 0,
            // Convert to string
            valueToString: value => `${value}`,

            // Filter out invalid values
            arrayToValue: array => array.filter(value => value),
            // Filter negative values
            valueToArray: value => value.filter(v => v > 0),

            // When state.selection is empty array hide the parameter selection
            defaultValue: []
        },
    },
    initialTruth: 'location',

    // Use replaceState so the browser's back/forward button will skip over these page changes.
    replaceState: true,
})
```

Note you could equally well put the conversion to and from the string in the selector and action
creator, respectively. The `defaultValue` should then of course be a string too.


## API

<a name="ReduxQuerySync"></a>

### ReduxQuerySync()
Sets up bidirectional synchronisation between a Redux store and window location query parameters.

| Param | Type | Description |
| --- | --- | --- |
| options.store | <code>Object</code> | The Redux store object (= an object `{dispatch, getState}`). |
| options.params | <code>Object</code> | The query parameters in the location to keep in sync. |
| options.params[].action | <code>function: value => action</code> | The action creator to be invoked with the parameter value. Should return an action that sets this value in the store. |
| options.params[].selector | <code>function: state => value</code> | The function that gets the value given the state. |
| [options.params[].defaultValue] | <code>\*</code> | The value corresponding to absence of the parameter. You may want this to equal the state's default/initial value. Default: `undefined`. |
| [options.params[].valueToString] | <code>function</code> | Specifies how to cast the value to a string, to be used in the URL. Defaults to javascript's automatic string conversion. |
| [options.params[].stringToValue] | <code>function</code> | The inverse of valueToString. Specifies how to parse the parameter's string value to your desired value type. Defaults to the identity function (i.e. you get the string as it is). |
| [options.params[].multiple] | <code>boolean</code> | When true value support multiple values per key - i.e. `key=1&key=2`. The returned value from `selector` must be an array, and the provided value to `action` is also an array. The mappers `valueToString` and `stringToValue` are applied to each element of the array. Mappers `valueToArray` and `arrayToValue` can convert the whole array. |
| [options.params[].valueToArray] | <code>function</code> | Converts the value to string array when `multiple` is true. |
| [options.params[].arrayToValue] | <code>function</code> | Reverse convertion from string array to value. |
| options.initialTruth | <code>string</code> | If set, indicates whose values to sync to the other, initially. Can be either `'location'` or `'store'`. If not set, the first of them that changes will set the other, which is not recommended. Usually you will want to use `location`. |
| [options.replaceState] | <code>boolean</code> | If truthy, update location using `history.replaceState` instead of `history.pushState`, to not add entries to the browser history. Default: false |
| [options.history] | <code>Object</code> | If you use the 'history' module, e.g. when using a router, pass your history object here in order to ensure all code uses the same instance. |


Returns: a function `unsubscribe()` that can be called to stop the synchronisation.

<a name="ReduxQuerySync.enhancer"></a>

### ReduxQuerySync.enhancer()
For convenience, one can set up the synchronisation by passing an enhancer to createStore.

**Example**
```js
const storeEnhancer = ReduxQuerySync.enhancer({
    params,
    initialTruth,
    replaceState,
})
const store = createStore(reducer, initialState, storeEnhancer)
```

Arguments to `ReduxQuerySync.enhancer` are equal to those for `ReduxQuerySync` itself, except that
`store` can now of course be omitted. With this approach, you cannot cancel the synchronisation.
