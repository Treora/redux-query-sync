import createHistory from 'history/createBrowserHistory'
import URLSearchParams from 'url-search-params';

/**
 * Sets up bidirectional synchronisation between a Redux store and window
 * location query parameters.
 *
 * @param {Object} options.store - The redux store object (= an object `{dispatch, getState}`).
 * @param {Object} options.params - The query parameters in the location to keep in sync.
 * @param {function value => action} options.params[].action - The action creator to be invoked with
 *     the parameter value. Should return an action that sets this value in the store.
 * @param {function state => value} options.params[].selector - The function that gets the value
 *     given the state.
 * @param {*} [options.params[].defaultValue] - The value corresponding to absence of the parameter.
 *     You may want this to equal the state's default/initial value. Default: `undefined`.
 * @param {function} [options.params[].valueToString] - The inverse of stringToValue. Specifies how
 *     to cast the value to a string, to be used in the URL. Defaults to javascript's automatic
 *     string conversion.
 * @param {function} [options.params[].stringToValue] - The inverse of valueToString. Specifies how
 *     to parse the parameter's string value to your desired value type. Defaults to the identity
 *     function (i.e. you get the string as it is).
 * @param {string} options.initialTruth - If set, indicates whose values to sync to the other,
 *     initially. Can be either `'location'` or `'store'`. If not set, the first of them that
 *     changes will set the other, which is not recommended. Usually you will want to use
 *     `location`.
 * @param {boolean} [options.replaceState] - If truthy, update location using
 *     history.replaceState instead of history.pushState, to not fill the browser history.
 * @param {Object} [options.history] - If you use the 'history' module, e.g. when using a router,
 *     pass your history object here in order to ensure all code uses the same instance.
 */
function ReduxQuerySync({
    store,
    params,
    replaceState,
    initialTruth,
    history = createHistory(),
}) {
    const { dispatch } = store

    // Two bits of state used to not respond to self-induced updates.
    let ignoreLocationUpdate = false
    let ignoreStateUpdate = false

    // Keeps the last seen values for comparing what has changed.
    let lastQueryValues

    // Helper function to support history module v3 as well as v4.
    function getLocation(history) {
        if (Object.hasOwnProperty.call(history, 'location')) {
            return history.location
        } else if (Object.hasOwnProperty.call(history, 'getCurrentLocation')) {
            return history.getCurrentLocation()
        }
    }

    function getQueryValues(location) {
        const locationParams = new URLSearchParams(location.search);
        const queryValues = {}
        Object.keys(params).forEach(param => {
            const { defaultValue, stringToValue = s => s } = params[param]
            const valueString = locationParams.get(param)
            const value = (valueString === null)
                ? defaultValue
                : stringToValue(valueString)
            queryValues[param] = value
        })
        return queryValues
    }

    function handleLocationUpdate(location) {
        // Ignore the event if the location update was induced by ourselves.
        if (ignoreLocationUpdate) return

        const state = store.getState()

        // Read the values of the watched parameters
        const queryValues = getQueryValues(location)

        // For each parameter value that changed, we dispatch the corresponding action.
        const actionsToDispatch = []
        Object.keys(queryValues).forEach(param => {
            const value = queryValues[param]
            // Process the parameter both on initialisation and if it has changed since last time.
            // (should we just do this unconditionally?)
            if (lastQueryValues === undefined || lastQueryValues[param] !== value) {
                const { selector, action } = params[param]

                // Dispatch the action to update the state if needed.
                // (except on initialisation, this should always be needed)
                if (selector(state) !== value) {
                    actionsToDispatch.push(action(value))
                }
            }
        })

        lastQueryValues = queryValues

        ignoreStateUpdate = true
        actionsToDispatch.forEach(action => {
            dispatch(action)
        })
        ignoreStateUpdate = false

        // Update the location the again: reducers may have e.g. corrected invalid values.
        handleStateUpdate({replaceState: true})
    }

    function handleStateUpdate({replaceState}) {
        if (ignoreStateUpdate) return

        const state = store.getState()
        const location = getLocation(history)

        // Parse the current location's query string.
        const locationParams = new URLSearchParams(location.search);

        // Replace each configured parameter with its value in the state.
        Object.keys(params).forEach(param => {
            const { selector, defaultValue, valueToString = v => `${v}` } = params[param]
            const value = selector(state)
            if (valueToString(value) === valueToString(defaultValue)) {
                locationParams.delete(param)
            } else {
                locationParams.set(param, valueToString(value))
            }
            lastQueryValues[param] = value
        })
        const newLocationSearchString = `?${locationParams}`
        const oldLocationSearchString = location.search || '?'

        // Only update location if anything changed.
        if (newLocationSearchString !== oldLocationSearchString) {
            // Update location (but prevent triggering a state update).
            ignoreLocationUpdate = true
            const newLocation = {
                pathname: location.pathname,
                search: newLocationSearchString,
                hash: location.hash,
                state: location.state,
            }
            replaceState
                ? history.replace(newLocation)
                : history.push(newLocation)
            ignoreLocationUpdate = false
        }
    }

    // Sync location to store on every location change, and vice versa.
    const unsubscribeFromLocation = history.listen(handleLocationUpdate)
    const unsubscribeFromStore = store.subscribe(() => handleStateUpdate({replaceState}))

    // Sync location to store now, or vice versa, or neither.
    if (initialTruth === 'location') {
        handleLocationUpdate(getLocation(history))
    } else {
        // Just set the last seen values to later compare what changed.
        lastQueryValues = getQueryValues(getLocation(history))
    }
    if (initialTruth === 'store') {
        handleStateUpdate({replaceState: true})
    }

    return function unsubscribe() {
        unsubscribeFromLocation()
        unsubscribeFromStore()
    }
}

/**
 * For convenience, one can set up the synchronisation by passing this enhancer to createStore.
 *
 * @example
 *
 *     const storeEnhancer = ReduxQuerySync.enhancer({params, initialTruth: 'location'})
 *     const store = createStore(reducer, initialState, storeEnhancer)
 *
 * Arguments are equal to those of ReduxQuerySync itself, except that `store` can now be omitted.
 */
ReduxQuerySync.enhancer = function makeStoreEnhancer(config) {
    return storeCreator => (reducer, initialState, enhancer) => {
        // Create the store as usual.
        const store = storeCreator(reducer, initialState, enhancer)

        // Hook up our listeners.
        ReduxQuerySync({store, ...config})

        return store
    }
}

export default ReduxQuerySync
