import { setDefaultProfileRepository } from "../src/auth/authenticate.js";
import { testProfiles } from "./helpers/profiles.js";

// Les pseudos viennent de la table `profiles` (aucun repli) : tous les tests utilisent un dépôt
// en mémoire, alimenté par `signTestToken` (voir `helpers/auth.ts`). Aucun appel réseau.
setDefaultProfileRepository(testProfiles);
