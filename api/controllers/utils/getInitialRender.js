'use strict';

const React = require('react');

const { renderToString, renderToStaticMarkup } = require('react-dom/server');
const { Router, RouterContext, match } = require('react-router');
const { Provider } = require('react-redux');
const Layout = require('./../../../dist/components/Layout').default;
const once = require('lodash/once');
const debounce = require('lodash/debounce');

const configureStore = require('./configureStore');
const routes = require('./../../../dist/routes');
const loginActions = require('./../../../dist/redux/actions/login-actions');

function matchRoute(url, callback) {
    match({
        routes: React.createElement(Router, null, routes),
        location: url
    }, callback);
}

function renderLayout(store, props, request, bundle = 'client') {
    const host = `${request.connection.info.protocol}://${request.info.host}`;
    const url = `${host}${request.url.path}`;

    return renderToStaticMarkup(
        React.createElement(
            Layout,
            { bundle, host, url, state: store.getState() },
            renderToString(React.createElement(
                Provider,
                { store: store },
                React.createElement(RouterContext, props)
            ))
        )
    );
}

function getInitialRender(request, bundle, callback) {

    const store = configureStore(bundle);
    const queue = new Set();
    const user = request.yar.get('user') || {};

    matchRoute(request.url.path, (err, redirect, props) => {

        const render = once(() => {
            const layout = renderLayout(store, props, request, bundle);
            return callback(null, layout);
        });
        // Waits 100ms for next event to occour, but for maximum of 1250ms.
        const debouncedRender = debounce(render, 100, { maxWait: 1250 });
        // Render after 100ms if no actions are dispatched
        const initialRender = setTimeout(render, 1000);

        store.dispatch(loginActions.userLogin({
            name: user.name,
            emailAddress: user.emailAddress,
            role: user.role
        }));

        // Subscribe to the redux store
        store.subscribe(() => {
            clearTimeout(initialRender);

            // Fetch last action from state
            const { lastAction } = store.getState();
            const type = lastAction && lastAction.type;
            if (!type) return;

            const key = type.replace(/_(REQUEST|SUCCESS|FAILED)/, '');

            if (type.match(/_REQUEST$/)) {
                // Add to the queue if key ends with _REQUEST.
                queue.add(key);
            }

            else if (queue.has(key)) {
                // Remove from the queue if await was success or failed.
                queue.delete(key);
            }

            if (queue.size === 0) {
                // Queue is cleared, let's render
                debouncedRender();
            }

        });

        // Perform an initial render to kick things off.
        renderLayout(store, props, request, bundle);
    });
}

function getClientRender(request, callback) {
    return getInitialRender(request, 'client', callback);
}

function getAdminRender(request, callback) {
    return getInitialRender(request, 'admin', callback);
}

module.exports = {
    getClientRender,
    getAdminRender
};
