export const MOD_TYPE = 'collection';
export const NAMESPACE = 'collection';
export const AUTHOR_UNKNOWN = '<Unknown User>';
export const AVATAR_FALLBACK = 'assets/images/noavatar.png';
export const NEXUS_DOMAIN = process.env['NEXUS_DOMAIN'] || 'nexusmods.com';
export const NEXUS_MEMBERSHIP_URL = `https://users.${NEXUS_DOMAIN}/register/memberships`;

// limits
export const NAME_LENGTH_MIN = 4;
export const NAME_LENGTH_SOFT_LIMIT = 40;
export const NAME_LENGTH_HARD_LIMIT = 75;
