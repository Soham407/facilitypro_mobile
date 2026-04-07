import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import * as Sentry from '@sentry/react-native';

import App from './App';
import { definePatrolTask } from './src/lib/patrolTask';
import { defineHrmsTask } from './src/lib/hrmsTask';

Sentry.init({
  dsn: 'https://4a0c40d181eb499b1f64b0d0911a3d7c@o4511157498740736.ingest.de.sentry.io/4511157507719248',
  // Set tracesSampleRate to 1.0 to capture 100% of transactions for tracing.
  // We recommend adjusting this value in production.
  tracesSampleRate: 1.0,
  _experiments: {
    // profilesSampleRate is relative to tracesSampleRate.
    // Setting this to 1.0 will profile 100% of transactions.
    profilesSampleRate: 1.0,
  },
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
definePatrolTask();
defineHrmsTask();
registerRootComponent(Sentry.wrap(App));
