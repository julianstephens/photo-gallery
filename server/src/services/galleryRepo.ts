import redis from "../redis.ts";

export class GalleryRepo {
  #client;

  constructor() {
    this.#client = redis.client;
  }

  async listGalleries(guildId: string) {
    return this.#client.get(`guild:${guildId}:galleries`);
  }

  async createGallery(guildId: string, galleryName: string) {
    return this.#client.sAdd(`guild:${guildId}:galleries`, galleryName);
  }

  async deleteGallery(guildId: string, galleryName: string) {
    return this.#client.sRem(`guild:${guildId}:galleries`, galleryName);
  }

  async renameGallery(guildId: string, oldName: string, newName: string) {
    const multi = this.#client.multi();
    multi.sRem(`guild:${guildId}:galleries`, oldName);
    multi.sAdd(`guild:${guildId}:galleries`, newName);
    return multi.exec();
  }
}
