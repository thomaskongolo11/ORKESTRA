/**
 * Rôles du plugin organisation de Better Auth.
 *
 * Personne n'a la permission `invitation:create` : les invitations natives du
 * plugin utilisent l'identifiant comme jeton sans hachage. ORKESTRA utilise son
 * propre modèle `Invitation` (jeton haché, usage unique).
 *
 * Personne n'a non plus `member:create` ni `organization:delete` via le plugin :
 * les membres arrivent par invitation, les organisations sont gérées par l'admin
 * de la plateforme.
 */
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

export const ac = createAccessControl(defaultStatements);

export const orgRoles = {
  CLIENT_ADMIN: ac.newRole({
    organization: ["update"],
    member: ["update", "delete"],
  }),
  MANAGER: ac.newRole({}),
  EMPLOYEE: ac.newRole({}),
};
