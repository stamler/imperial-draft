import About from "./about.js"

// TODO: pull this Azure client config from a firebase document
const clientId = "5ce67993-106b-4c1f-a930-bafd39863126";
const tenant = "tenant.onmicrosoft.com";

// Initialize Firebase
firebase.initializeApp({
  apiKey: "<Your data here>",
  authDomain: "authdo-cf4f.firebaseapp.com",
  databaseURL: "https://authdo-cf4f.firebaseio.com",
  projectId: "authdo-cf4f",
  storageBucket: "authdo-cf4f.appspot.com",
  messagingSenderId: "9201877773011"
});

const db = firebase.firestore();

Vue.use(Vuefire);
Vue.component('navbar',{
  props: [ 'state', 'user' ],
  data: function () {
    return {
      message: "Hello, "
    }
  },
  template: '<div v-if="state == \'ready\'">' +
  '<input id="signOutButtonIncomplete" type="button" value="Sign Out firebase only" v-on:click="signOut(false);" />' +
  '<input id="signOutButton" type="button" value="Sign Out" v-on:click="signOut();" />' +
  '{{ message }}{{ user.displayName }}' +
  '</div>' +
  '<div v-else-if="state == \'loading\'">Loading...</div>' +
  '<div v-else>Unknown State</div>',
  methods: {
    signOut: signOut
  }
});

const router = new VueRouter({
  mode: 'history',
  routes: [
    {
      path: '/',
      redirect: '/dashboard'
    },
    { 
      path: '/about', 
      component: About
    },
    { 
      path: '/RawLogins', 
      component: {
        data() {
          return {
            rawLogins: []
          }
        },
        firestore() {
          return {
            rawLogins: db.collection('RawLogins').orderBy('created')
          }
        },
        template: '<div><h2>RawLogins</h2><ul>' +
                  '<li v-for="item in rawLogins">{{ item.mfg }}</li>' +
                  '</ul></div>'
      }
    },
    { 
      path: '/dashboard', 
      component: { template: '<p>The Dashboard</p>' }
    },
    { 
      path: '*', 
      component: { template: '<h1>404</h1>' }
    }
  ]
})

/* eslint-disable no-new */
const app = new Vue({
  el: '#app',
  router: router,
  data: {
    state: "loading", // app state can be "loading", "ready"
    user: null
  }
});

// Save the unsubscribe function for the observer for SignOut() function
// https://firebase.google.com/docs/reference/js/firebase.auth.Auth#onAuthStateChanged
// https://stackoverflow.com/questions/37370224/firebase-stop-listening-onauthstatechanged
const unsubscribe = firebase.auth().onAuthStateChanged(async function (user) {
  if (user) {
    // set name for signed in user
    app.user = firebase.auth().currentUser;

    app.state = "ready"; // set app to ready state
  } else {
    app.state = "loading"; // set app to loading state

    // no user is signed in, try to extract a token from URL fragment
    const hash = window.location.hash.substring(1);
    const hashParams = hash.split('&').reduce(function (result, item) {
      const parts = item.split('=');
      result[parts[0]] = parts[1];
      return result;
    },{});
    // erase token url from history TODO: pushState() or replaceState()?
    window.history.pushState({},'','/');

    // If id_token was extracted, use it to get a firebase token
    if (hashParams.hasOwnProperty('id_token')) {
      // TODO: should client validate the Azure id_token signature?

      // validate the nonce in the azure id_token against submitted value
      if (window.localStorage.nonce != jwt_decode(hashParams['id_token']).nonce) {
        console.log("nonce in Azure Token doesn't match submitted nonce");
        // TODO: write error to GUI here
      }

      let token;
      try {
        const response = await axios.get(
          'https://us-central1-charade-ca63f.cloudfunctions.net/getToken',
          { headers: { 
              Authorization: "Bearer " + hashParams['id_token'],
              'Content-Type': 'application/json'
            },
            data:{} //blank body necessary to preserve Content-Type header
          });
        token = response.data;
      } catch (error) {
        // TODO: write error to GUI here
        console.log(`AXIOS FAIL: ${error.request} // ${error}`);
      }
  
      try {
        await firebase.auth().signInWithCustomToken(token)
      } catch (error) {
        // TODO: write error to GUI here
        console.error(error.code + ' ' + error.message);        
      }

    } else {      
      // User not authenticated and no token present. 

      window.localStorage.setItem('nonce', randomString(32)); // generate nonce

      // Create a request string
      let url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=id_token&scope=openid+profile+email&nonce=${window.localStorage.nonce}&response_mode=fragment`;
      if (window.location.port === "8080") {
        // Adjust the requested redirectUri for local development
        url = url + "&redirect_uri=http%3A%2F%2Flocalhost%3A8080";
      }

      // Redirect to Azure AD for authentication token
      window.location.href = url;
    }
  }
});

function signOut(complete = true) {
  unsubscribe();
  firebase.auth().signOut();
  console.log("signed out of firebase");
  // TODO: change application state and/or change name / message
  if (complete) {
    window.location.href='https://login.windows.net/common/oauth2/logout'
  }
}

function randomString(length) {
  const cset = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  if (length > 0) {
    window.crypto.getRandomValues(new Uint8Array(length)).forEach( (c) => {
      result += cset[c % cset.length];
    });
  }
  return result;
}