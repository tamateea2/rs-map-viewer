import { spawn, Pool, ModuleThread } from "threads";
import { QueuedTask } from "threads/dist/master/pool";
import { ObservablePromise } from "threads/dist/observable-promise";
import { WorkerDescriptor } from "threads/dist/master/pool-types";
import { RenderDataWorker } from "./RenderDataWorker";
import { LoadedCache } from "../Caches";
import { RenderDataLoader } from "./RenderDataLoader";
import { MinimapData } from "../data/MinimapData";
import { ObjSpawn } from "../data/obj/ObjSpawn";
import { NpcSpawn } from "../data/npc/NpcSpawn";

type RenderDataWorkerThread = ModuleThread<RenderDataWorker>;

function spawnWorker(): Promise<RenderDataWorkerThread> {
    const worker = new Worker(new URL("./RenderDataWorker", import.meta.url));
    return spawn<RenderDataWorker>(worker);
}

export class RenderDataWorkerPool {
    static create(size: number): RenderDataWorkerPool {
        const pool = Pool(() => spawnWorker(), size);
        const workers = pool["workers"] as WorkerDescriptor<RenderDataWorkerThread>[];
        return new RenderDataWorkerPool(pool, workers, size);
    }

    constructor(
        readonly pool: Pool<RenderDataWorkerThread>,
        readonly workers: WorkerDescriptor<RenderDataWorkerThread>[],
        readonly size: number,
    ) {}

    initCache(cache: LoadedCache, objSpawns: ObjSpawn[], npcSpawns: NpcSpawn[]): void {
        for (const worker of this.workers) {
            worker.init.then((w) => w.initCache(cache, objSpawns, npcSpawns));
        }
    }

    async runAll(task: (w: RenderDataWorkerThread) => any): Promise<void> {
        await Promise.all(this.workers.map((desc) => desc.init.then(task)));
    }

    initLoader(loader: RenderDataLoader<any, any>): Promise<void> {
        return this.runAll((w) => w.initDataLoader(loader));
    }

    resetLoader(loader: RenderDataLoader<any, any>): Promise<void> {
        return this.runAll((w) => w.resetDataLoader(loader));
    }

    queueLoad<I, D, Loader extends RenderDataLoader<I, D>>(
        loader: Loader,
        input: I,
    ): QueuedTask<RenderDataWorkerThread, D> {
        return this.pool.queue((w) => w.load(loader, input) as ObservablePromise<D>);
    }

    queueMinimap(
        mapX: number,
        mapY: number,
        level: number,
    ): QueuedTask<RenderDataWorkerThread, MinimapData | undefined> {
        return this.pool.queue((w) => w.loadMinimap(mapX, mapY, level));
    }

    exportSprites(): QueuedTask<RenderDataWorkerThread, Blob> {
        return this.pool.queue((w) => w.exportSpritesToZip());
    }

    terminate(): Promise<void> {
        return this.pool.terminate();
    }
}
