// Set at the start of a full wipe. Every writer that could put data back (the IndexedDB
// mirrors and the vault) checks it right before writing, so a save that was already in
// flight when the wipe began can't land afterwards and resurrect the identity.
// The page always reloads after a wipe, which resets this.

let wiping = false;

export const beginWipe = () => {
  wiping = true;
};

export const isWiping = () => wiping;
