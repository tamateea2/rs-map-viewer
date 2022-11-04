import { expose, Transfer } from "threads/worker";
import { ConfigType } from "./client/fs/ConfigType";
import { loadFromStore } from "./client/fs/FileSystem";
import { IndexSync } from "./client/fs/Index";
import { IndexType } from "./client/fs/IndexType";
import { CachedObjectLoader } from "./client/fs/loader/ObjectLoader";
import { CachedOverlayLoader } from "./client/fs/loader/OverlayLoader";
import { CachedUnderlayLoader } from "./client/fs/loader/UnderlayLoader";
import { MemoryStore } from "./client/fs/MemoryStore";
import { StoreSync } from "./client/fs/Store";
import { RegionLoader } from "./client/RegionLoader";
import { TextureLoader } from "./client/fs/loader/TextureLoader";
import { Compression } from "./client/util/Compression";
import { Scene } from "./client/Scene";
import { packHsl } from "./client/util/ColorUtil";
import { ChunkDataLoader } from "./ChunkDataLoader";

type MemoryStoreProperties = {
    dataFile: ArrayBuffer,
    indexFiles: (ArrayBuffer | undefined)[],
    metaFile: ArrayBuffer
};

/*
    const verticesTyped = new Float32Array(vertices);
    const colorsTyped = new Uint8Array(colors);
    const texCoordsTyped = new Float32Array(texCoords);
    const textureIdsTyped = new Uint8Array(textureIds);
*/

let chunkDataLoader: ChunkDataLoader | undefined;

const wasmCompressionPromise = Compression.initWasm();

expose({
    async init(memoryStoreProperties: MemoryStoreProperties, xteasMap: Map<number, number[]>) {
        // await wasmCompressionPromise;

        const store = new MemoryStore(memoryStoreProperties.dataFile, memoryStoreProperties.indexFiles, memoryStoreProperties.metaFile);

        const fileSystem = loadFromStore(store);

        const configIndex = fileSystem.getIndex(IndexType.CONFIGS);
        const mapIndex = fileSystem.getIndex(IndexType.MAPS);
        const spriteIndex = fileSystem.getIndex(IndexType.SPRITES);
        const textureIndex = fileSystem.getIndex(IndexType.TEXTURES);
        const modelIndex = fileSystem.getIndex(IndexType.MODELS);

        const underlayArchive = configIndex.getArchive(ConfigType.UNDERLAY);
        const overlayArchive = configIndex.getArchive(ConfigType.OVERLAY);
        const objectArchive = configIndex.getArchive(ConfigType.OBJECT);

        const underlayLoader = new CachedUnderlayLoader(underlayArchive);
        const overlayLoader = new CachedOverlayLoader(overlayArchive);
        const objectLoader = new CachedObjectLoader(objectArchive);

        const regionLoader = new RegionLoader(mapIndex, underlayLoader, overlayLoader, objectLoader, xteasMap);

        const textureProvider = TextureLoader.load(textureIndex, spriteIndex);

        chunkDataLoader = new ChunkDataLoader(regionLoader, modelIndex, textureProvider);
        console.log('init worker', fileSystem);
    },
    load(regionX: number, regionY: number) {
        if (!chunkDataLoader) {
            throw new Error('ChunkLoaderWorker not initialized');
        }
        console.time(`load chunk ${regionX}_${regionY}`);
        const chunkData = chunkDataLoader.load(regionX, regionY);
        console.timeEnd(`load chunk ${regionX}_${regionY}`);

        const transferables: Transferable[] = [
            chunkData.vertices.buffer, chunkData.colors.buffer, chunkData.texCoords.buffer, chunkData.textureIds.buffer, 
            chunkData.perModelTextureData.buffer, chunkData.heightMapTextureData.buffer
        ];

        chunkDataLoader.regionLoader.regions.clear();
        chunkDataLoader.regionLoader.blendedUnderlayColors.clear();
        chunkDataLoader.regionLoader.lightLevels.clear();

        return Transfer(chunkData, transferables);
    }
});