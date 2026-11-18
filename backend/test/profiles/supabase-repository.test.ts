import { describe, expect, it } from "vitest";

import { DEFAULT_HAND_ORDER } from "../../src/profiles/hand-order.js";
import { ProfileLookupError } from "../../src/profiles/repository.js";
import { SupabaseProfileRepository } from "../../src/profiles/supabase-repository.js";

/**
 * Le dépôt Supabase est testé avec un `fetch` simulé : aucune requête ne sort de la machine.
 * Le comportement réel de la RLS est vérifié par la migration elle-même (voir supabase/README.md).
 */

const URL_ = "https://abcd.supabase.co";
const KEY = "sb_publishable_test_key";
const USER = "4b0d5c7e-1111-4222-8333-944455556666";
const TOKEN = "user.access.token";

type Call = { url: URL; init: RequestInit };

/** `fetch` simulé : renvoie la réponse donnée et note chaque appel. */
function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: new URL(String(input)), init: init ?? {} };
    calls.push(call);
    return respond(call);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function repository(respond: (call: Call) => Response | Promise<Response>, timeoutMs?: number) {
  const fake = fakeFetch(respond);
  const repo = new SupabaseProfileRepository({
    url: `${URL_}/`,
    publishableKey: KEY,
    fetch: fake.fetch,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  return { repo, calls: fake.calls };
}

describe("SupabaseProfileRepository : profils", () => {
  it("lit le profil avec la clé publique et le jeton du joueur (RLS appliquée)", async () => {
    const { repo, calls } = repository(() => json([{ id: USER, username: "Alice" }]));
    expect(await repo.findProfile(USER, TOKEN)).toEqual({ id: USER, username: "Alice" });

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url.origin + url.pathname).toBe(`${URL_}/rest/v1/profiles`);
    expect(url.searchParams.get("select")).toBe("id,username");
    expect(url.searchParams.get("id")).toBe(`eq.${USER}`);
    expect(init.method).toBe("GET");
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe(KEY);
    // Le jeton du joueur, jamais une clé de service.
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("profil absent : null", async () => {
    const { repo } = repository(() => json([]));
    expect(await repo.findProfile(USER, TOKEN)).toBeNull();
  });

  it("identifiant qui n'est pas un UUID : null, sans requête", async () => {
    const { repo, calls } = repository(() => json([]));
    expect(await repo.findProfile("user-1", TOKEN)).toBeNull();
    expect(await repo.findProfile("x&id=neq.0", TOKEN)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("Supabase injoignable : ProfileLookupError", async () => {
    const { repo } = repository(() => {
      throw new TypeError("fetch failed");
    });
    await expect(repo.findProfile(USER, TOKEN)).rejects.toBeInstanceOf(ProfileLookupError);
  });

  it("délai dépassé : ProfileLookupError", async () => {
    const { repo } = repository(
      ({ init }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
        }),
      20,
    );
    await expect(repo.findProfile(USER, TOKEN)).rejects.toThrow(ProfileLookupError);
  });

  it("erreur HTTP (401, 500…) : ProfileLookupError", async () => {
    for (const status of [401, 403, 500, 503]) {
      const { repo } = repository(() => json({ message: "nope" }, status));
      await expect(repo.findProfile(USER, TOKEN)).rejects.toThrow(String(status));
    }
  });

  it("réponse inattendue : ProfileLookupError", async () => {
    const bodies: (() => Response)[] = [
      () => new Response("<html>oops</html>", { status: 200 }),
      () => json({ id: USER, username: "Alice" }),
      () =>
        json([
          { id: USER, username: "Alice" },
          { id: USER, username: "Bob" },
        ]),
      () => json([null]),
      () => json([{ id: "un-autre", username: "Alice" }]),
      () => json([{ id: USER, username: 42 }]),
    ];
    for (const body of bodies) {
      const { repo } = repository(body);
      await expect(repo.findProfile(USER, TOKEN)).rejects.toBeInstanceOf(ProfileLookupError);
    }
  });
});

describe("SupabaseProfileRepository : paramètres", () => {
  const stored = {
    groups: ["trumps", "excuse", "hearts", "spades", "diamonds", "clubs"],
    direction: "descending",
  };

  it("lit les paramètres du joueur avec son jeton", async () => {
    const { repo, calls } = repository(() => json([{ user_id: USER, hand_order: stored }]));
    expect(await repo.findSettings(USER, TOKEN)).toEqual({ handOrder: stored });
    const { url, init } = calls[0]!;
    expect(url.pathname).toBe("/rest/v1/settings");
    expect(url.searchParams.get("user_id")).toBe(`eq.${USER}`);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("aucune ligne (ou masquée par la RLS) : null", async () => {
    const { repo } = repository(() => json([]));
    expect(await repo.findSettings(USER, TOKEN)).toBeNull();
  });

  it("ordre stocké invalide : ordre par défaut", async () => {
    const { repo } = repository(() =>
      json([{ user_id: USER, hand_order: { groups: ["spades"], direction: "up" } }]),
    );
    expect(await repo.findSettings(USER, TOKEN)).toEqual({ handOrder: DEFAULT_HAND_ORDER });
  });

  it("erreur : ProfileLookupError", async () => {
    const { repo } = repository(() => json({}, 500));
    await expect(repo.findSettings(USER, TOKEN)).rejects.toBeInstanceOf(ProfileLookupError);
  });
});
