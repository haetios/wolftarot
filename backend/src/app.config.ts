import {
  defineServer,
  defineRoom,
  monitor,
  playground,
  createRouter,
  createEndpoint,
} from "colyseus";

/**
 * Import your Room files
 */
import { TarotRoom } from "./rooms/TarotRoom.js";
import { defaultTokenVerifier } from "./auth/authenticate.js";

// Lit la configuration Supabase dès le démarrage : une valeur invalide arrête le serveur
// avec une erreur explicite, plutôt qu'à la première connexion.
defaultTokenVerifier();

const server = defineServer({
  /**
   * Define your room handlers:
   */
  rooms: {
    tarot: defineRoom(TarotRoom),
  },

  /**
   * Experimental: Define API routes. Built-in integration with the "playground" and SDK.
   *
   * Usage from SDK:
   *   client.http.get("/api/hello").then((response) => {})
   *
   */
  routes: createRouter({
    api_hello: createEndpoint("/api/hello", { method: "GET" }, async (_ctx) => {
      return { message: "Hello World" };
    }),
  }),

  /**
   * Bind your custom express routes here:
   * Read more: https://expressjs.com/en/starter/basic-routing.html
   */
  express: (app) => {
    app.get("/health", (_req, res) => {
      res.json({ status: "ok" });
    });

    /**
     * Use @colyseus/monitor
     * If you expose it in production, make sure to protect it with a password:
     * https://docs.colyseus.io/tools/monitoring#password-protection
     */
    if (process.env.NODE_ENV !== "production") {
      app.use("/monitor", monitor());
    }

    /**
     * Use @colyseus/playground
     * (It is not recommended to expose this route in a production environment)
     */
    if (process.env.NODE_ENV !== "production") {
      app.use("/", playground());
    }
  },
});

export default server;
