import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import { ErrorCode } from "colyseus";

import appConfig from "../../src/app.config.js";
import { setDefaultProfileRepository } from "../../src/auth/authenticate.js";
import type { TarotRoom } from "../../src/rooms/TarotRoom.js";
import { connectAs, connectWithToken, signTestToken } from "../helpers/auth.js";
import { InMemoryProfileRepository, testProfiles } from "../helpers/profiles.js";

/** La room lit les pseudos dans `profiles` (dépôt en mémoire : aucun appel réseau). */
describe("TarotRoom : pseudos lus dans les profils", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;
  let profiles: InMemoryProfileRepository;

  const ALICE = "4b0d5c7e-1111-4222-8333-944455556666";
  const BOB = "4b0d5c7e-2222-4222-8333-944455556666";

  beforeAll(async () => {
    colyseus = await boot(appConfig);
  });
  afterAll(async () => {
    setDefaultProfileRepository(testProfiles);
    await colyseus.shutdown();
  });
  beforeEach(async () => {
    await colyseus.cleanup();
    profiles = new InMemoryProfileRepository().withProfile(ALICE, "Alice").withProfile(BOB, "Bob");
    setDefaultProfileRepository(profiles);
  });

  const createRoom = () => colyseus.createRoom<TarotRoom>("tarot", { playerCount: 3 });

  it("le pseudo vient du profil, pas de user_metadata", async () => {
    const room = await createRoom();
    const client = await connectAs(colyseus, room, { sub: ALICE, username: "Usurpateur" });

    expect(room.state.players.get(client.sessionId)!.name).toBe("Alice");
    const serverClient = room.clients.find((c) => c.sessionId === client.sessionId)!;
    expect(serverClient.auth).toEqual({ id: ALICE, name: "Alice" });
  });

  it("le profil est lu avec le jeton du joueur", async () => {
    const room = await createRoom();
    const token = await signTestToken({ sub: BOB });
    await connectWithToken(colyseus, room, token);
    expect(profiles.calls).toEqual([{ method: "findProfile", userId: BOB, token }]);
  });

  it("on ne peut pas prendre le pseudo d'un autre via user_metadata", async () => {
    const room = await createRoom();
    const alice = await connectAs(colyseus, room, { sub: ALICE });
    const bob = await connectAs(colyseus, room, { sub: BOB, username: "Alice" });
    expect(room.state.players.get(alice.sessionId)!.name).toBe("Alice");
    expect(room.state.players.get(bob.sessionId)!.name).toBe("Bob");
  });

  it("sans profil (compte supprimé) : connexion refusée, aucun siège pris", async () => {
    const room = await createRoom();
    const ghost = "4b0d5c7e-9999-4222-8333-944455556666";
    await expect(
      connectAs(colyseus, room, { sub: ghost, username: "Fantôme" }),
    ).rejects.toMatchObject({
      code: ErrorCode.AUTH_FAILED,
      message: expect.stringContaining("(profileNotFound)"),
    });
    expect(room.state.players.size).toBe(0);
    expect(room.clients.length).toBe(0);
  });

  it("Supabase injoignable : connexion refusée (profileUnavailable), aucun siège pris", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    profiles.unavailable = true;
    const room = await createRoom();
    await expect(
      connectAs(colyseus, room, { sub: ALICE, username: "Usurpateur" }),
    ).rejects.toMatchObject({
      code: ErrorCode.AUTH_FAILED,
      message: expect.stringContaining("(profileUnavailable)"),
    });
    expect(room.state.players.size).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
