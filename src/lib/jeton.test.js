import { describe, it, expect } from 'vitest';
import { extraireJeton } from './jeton.js';

const J = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

describe('extraireJeton', () => {
  it('lien complet', () => expect(extraireJeton(`https://x.netlify.app/aidant#${J}`)).toBe(J));
  it('jeton seul', () => expect(extraireJeton(J)).toBe(J));
  it('guillemets et espaces', () => expect(extraireJeton(`# "${J.slice(0, 30)} ${J.slice(30)}" `)).toBe(J));
  it('encodé', () => expect(extraireJeton(`#%22${J}%22`)).toBe(J));
  it('majuscules', () => expect(extraireJeton(J.toUpperCase())).toBe(J));
  it('paramètre cle', () => expect(extraireJeton(`?cle=${J}`)).toBe(J));
  it('incomplet', () => expect(extraireJeton(J.slice(0, 40))).toBeNull());
  it('vide', () => expect(extraireJeton('')).toBeNull());
});
