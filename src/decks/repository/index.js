import CloudDeckRepository from "./CloudDeckRepository";
import LocalDeckRepository from "./LocalDeckRepository";

export const localDeckRepository = new LocalDeckRepository();
export const cloudDeckRepository = new CloudDeckRepository();

export function getDeckRepository({ authenticated = false } = {}) {
  return authenticated ? cloudDeckRepository : localDeckRepository;
}
