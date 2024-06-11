"use strict";

/*
à considrer :
const name = request.params.name;   => URL: /hello/:name
const name = request.payload.name;  => si on a une méthode de requête de type : "POST" avec l'attribut "name".
*/

/*
On a deux type de plogin à intégrer dans le serveur Hapijs :
//  1 - Plugins déjà définis dans HapiJS (comme "hapi-geo-locate")
//  2 - Plugins complémentaires que nous ajoutons (comme "pluginUser" et "pluginRoot")
*/

const Hapi = require("@hapi/hapi");
const geo_locate = require("hapi-geo-locate");
const AuthCookie = require("@hapi/cookie");

// NB: En général, il existe deux manières d'utiliser les routes :
//     1 - enregistrer une route directement dans le serveur configuré (comme la route: GET:: http://localhost:3000 et GET:: http://localhost:3000/location)
//     2 - créer  un plugin (c'est comme un modul) dans lequel on peut enregistrer les routes respectives dans ce plugin, ensuite on peut enregistrer ce plugin sur le serveur pour utiliser ses routes (comme la route: GET:: http://localhost:3000/root et GET:: http://localhost:3000/user/info)

let pluginRoot = {
  name: "pluginRoot",
  register: async function (server, options) {
    console.log("done"); // cette partie là s'exécute une fois lors de lancement de l'App (server), On peut mettre ici des fonctions d'initialisation si nécessaire

    // GET:: http://localhost:3000/root
    server.route({
      options: {
        auth: false, // Pas besoin d'être authentifié pour accéder à cette route
      },
      method: "GET",
      path: "/root",
      handler: function (request, h) {
        return "hello world this is " + options.mess; // Ici, nous utilisons la variable "mess" qui est initialisée dans le plugin "pluginRoot" intégré dans la fonction register
      },
    });
  },
};

let pluginUser = {
  name: "pluginUser",
  register: async function (server, options) {
    console.log("done 2"); // cette partie là s'exécute une fois lors de lancement de l'App (server), On peut mettre ici des fonctions d'initialisation si nécessaire

    // GET:: http://localhost:3000/user/info (NB: an a ici le prefix "user")
    server.route({
      method: "GET",
      path: "/info",
      options: {
        // pre: Les pré-requêtes (prerequisites) permettent d'exécuter des fonctions avant le gestionnaire de route principal. mais cela s'exécute aprés extension "onRequest"
        //   Cela s'exécute avant la fonction handler()
        //   Les retours des fonctions appelées dans "pre" sont toujours initialisés et stocké dans l'objet "pre".
        //   et pour pouvoir accéder aux données "userInfo" récupérées par la fonction "getUserInfo()", vous devez vous rendre sur: request.pre.userInfo
        pre: [{ method: getUserInfo, assign: "userInfo" }],

        // Traitement de requete
        handler: async function (request, h) {
          // NB: ici "userOrders" est deja initialisé dans la session à travers l'extension "onRequest"
          // const orders = await request.server.methods.getUserOrders(request);
          const orders = await server.methods.getUserOrders(request);
          console.log("pluginUser - getUserOrders() - orders => ", orders);

          // ceci pour afficher le resultat sous format json.
          return {
            optionsData: options.data,
            userOrders: request.userOrders,
            preUser: request.pre.userInfo,
          };
        },
      },
    });
  },
};

const getUserInfo = async (request, h) => {
  console.log("getUserInfo => request.userOrders", request.userOrders);
  return {
    firstName: "toto",
    lastName: "fofo",
    status: true,
    orders: request.userOrders,
  };
};

const getUserOrders = async (request) => {
  // return request.pre.userInfo.orders || null // => c'est ok si getUserOrders() s'exécute dans la route. GET:: http://localhost:3000/user/info
  return request.userOrders || null;
};

// Configuration du serveur
const init = async () => {
  const server = Hapi.Server({
    host: "localhost",
    port: 3000,
  });

  // Cette extension (Extensions de Cycle de Vie) est exécutée au tout début du cycle de vie de la requête.
  //   Il s'exécute à chaque requête entrante.
  //   ici on va initialiser "userOrders" dans toutes les requêtes reçues avant qu'elles ne soient traitées dans la route concernée.
  server.ext("onRequest", (request, h) => {
    console.log("onRequest...");
    request.userOrders = [
      { idOrder: 12, status: false },
      { idOrder: 13, status: true },
    ];
    return h.continue;
  });

  // Enregistrez la méthode sur le serveur pour pouvoir l'utiliser dans n'importe quelle route enregistrée sur le serveur
  server.method("getUserOrders", getUserOrders);

  // Enregistrer le plugin cookie
  await server.register(AuthCookie);

  // Configurer la stratégie d'authentification "session" en utilisant les "cookies"
  server.auth.strategy("session", "cookie", {
    cookie: {
      name: "sid", // Nom du cookie
      password: "a_secure_password_that_is_at_least_32_characters_long", // Clé pour signer le cookie
      isSecure: false, // Doit être true en production pour utiliser HTTPS
    },
    redirectTo: false, // Si false, ne redirige pas automatiquement
    validateFunc: async (request, session) => {
      // vérifie la validité de la session
      //   par exp, vérifier le session.id avec la base de données ou toute autre source de données
      if (session.id === "9999") {
        // NB: La propriété "session.id" est initialisée avec la valeur "9999" provenant de l'objet "user" lors de la connexion. POST:: http://localhost:3000/login
        console.log("***********************************************");
        console.log("session.name", session?.name); // Output: John Doe
        console.log("session.scope", session?.scope?.join(", ")); // Output: manager
        console.log("***********************************************");
        return {
          valid: true,
          /*
          // ici tu peux réinisialiser les données de session à nouvaeu en ajoutant par exp d'autre informations
          credentials: { 
            user: 'John Doe override ...',
            scope: ['manager', 'admin']
          }
          */
        };
      } else {
        return { valid: false };
      }
    },
  });

  // Définir la stratégie par défaut
  server.auth.default("session");
  /*
  server.auth.default({  
    mode: 'optional',
    strategy: 'session'
  })
  */

  // définir et enregistrer les plugins
  await server.register([
    {
      plugin: geo_locate,
      options: {
        enabledByDefault: true,
      },
    },
    {
      plugin: pluginRoot,
      // On peut passer des variables dans l'objet 'options' pour les utiliser dans le plugin concerné
      options: {
        mess: "foobar",
      },
    },
    {
      routes: {
        prefix: "/user", // Préfixe les routes du plugin avec "/user", donc toutes les routes de ce plugin doivent commencer par "/user".
      },
      plugin: pluginUser,
      // On peut passer des valeurs aux plugins via le paramètre "options".
      options: {
        data: "test data ...",
      },
    },
  ]);

  // définir les routes directement sur le serveur
  server.route([
    {
      // GET:: http://localhost:3000
      method: "GET",
      path: "/",
      handler: async (request, h) => {
        // const userId = await request.server.methods.getUserOrders(request);
        const orders = await server.methods.getUserOrders(request);
        console.log(
          "http://localhost:3000 - getUserOrders() - status => ",
          orders
        );

        let toString = (obj) =>
          Object.entries(obj)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
        console.log(
          "http://localhost:3000 - request.auth.credentials => ",
          toString(request?.auth?.credentials)
        ); // Output: id: 9999, name: John Doe, scope: manager
        return "<h1>Hello World!</h1>";
      },
    },
    {
      // GET:: http://localhost:3000/location
      method: "GET",
      path: "/location",
      handler: (request, h) => {
        if (request.location) {
          // la variable "location" est defini ici dans cette requete parce qu'il est integré avec plugin: "geo_locate"
          return request.location; // il retourne votre Ip Adresse
        } else {
          return "<h1>Your location is not enabled by default!</h1>"; // cela affiché si le parametre "enabledByDefault" etait "false"
        }
      },
    },
    {
      method: "POST",
      path: "/login",
      options: {
        auth: false, // Pas besoin d'être authentifié pour accéder à cette route
      },
      handler: (request, h) => {
        // Simule une connexion réussie
        if (
          request.payload.email === "test@hotmail.com" &&
          request.payload.password === "123456"
        ) {
          // Ici, il s'agit des données d'utilisateur qui est retourné de la base de données.
          // NB: le "scope" est utilisé pour définir les droits de l'utilisateur concernant les routes auxquelles il peut accéder.
          const user = { id: "9999", name: "John Doe", scope: ["manager"] };

          // L'appel à request.cookieAuth.set(user) stocke l'intégralité de l'objet "user" dans le cookie de session.
          request.cookieAuth.set(user);
          return h.response("Logged in").code(200);
        } else {
          return h.response("Logged faild").code(403);
        }
      },
    },
    {
      options: {
        auth: false, // Pas besoin d'être authentifié pour accéder à cette route
      },
      method: "GET",
      path: "/logout",
      handler: (request, h) => {
        // vider la session
        request.cookieAuth.clear();
        return h.response("Logged out").code(200);
      },
    },

    {
      method: "GET",
      path: "/admin",
      handler: (request, h) => {
        const user = request.auth.credentials.user;
        return `Welcome to the admin dashboard, ${user}!`;
      },
      options: {
        auth: {
          access: {
            scope: ["admin"], // c'est le seul administrateur à avoir accès à cette route
          },
        },
      },
    },
    {
      method: "GET",
      path: "/manager",
      handler: (request, h) => {
        const name = request.auth.credentials.name;
        return `Welcome to the manager dashboard, ${name}!`;
      },
      options: {
        auth: {
          access: {
            scope: ["admin", "manager"], // seuls les administrateurs et les managers peuvent accéder à cette route ; pour les autres utilisateurs, même s'ils sont identifiés, l'accès est interdit.
          },
        },
      },
    },
  ]);

  // Démarrer le serveur
  await server.start();
  console.log(`Server started on: ${server.info.uri}`);
};

// cela juste pour capturer des erreurs
process.on("unhandledRejection", (err) => {
  console.log(err);
  process.exit(1);
});

init(); // lancer le serveur
