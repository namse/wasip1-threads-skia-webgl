import { envGl } from "./envGl";

export function createImportObject({
  memory: importMemory,
  module,
  nextTid,
  wasiImport,
  malloc,
  free,
  webgl,
  memory,
}: {
  memory: WebAssembly.Memory;
  module: WebAssembly.Module;
  nextTid: SharedArrayBuffer;
  wasiImport: Record<string, any>;
  malloc: (size: number) => number;
  free: (ptr: number) => void;
  webgl?: WebGL2RenderingContext;
}) {
  const glFunctions = envGl({
    malloc,
    webgl,
    memory,
  }) as any;

  for (const key in glFunctions) {
    const original = glFunctions[key];
    glFunctions[key] = (...args: (number | bigint)[]) => {
      console.debug(key, args.map((x) => x.toString(16)).join(","));
      return original(...args);
    };
  }

  return {
    env: {
      memory: importMemory,
      ...glFunctions,
      ...implSetJmp({
        memory,
        malloc,
        free,
      }),
    },
    wasi_snapshot_preview1: wasiImport,
    wasi: {
      "thread-spawn": (startArgPtr: number) => {
        const tid = Atomics.add(new Uint32Array(nextTid), 0, 1);
        self.postMessage({
          tid,
          nextTid,
          importMemory,
          module,
          startArgPtr,
        });

        return tid;
      },
    },
    imports: {},
  };
}

// https://github.com/aheejin/emscripten/blob/878a2f1306e25cce0c1627ef5c06e9f60d85df80/system/lib/compiler-rt/emscripten_setjmp.c
function implSetJmp({
  memory,
  malloc,
  free,
}: {
  memory: WebAssembly.Memory;
  malloc: (size: number) => number;
  free: (ptr: number) => void;
}): {
  saveSetjmp: Function;
  testSetjmp: Function;
  getTempRet0: Function;
  setTempRet0: Function;
} {
  // // 0 - Nothing thrown
  // // 1 - Exception thrown
  // // Other values - jmpbuf pointer in the case that longjmp was thrown
  // static uintptr_t setjmpId = 0;
  let setjmpId = 0;
  let tempRet0 = 0;

  function getTempRet0() {
    return tempRet0;
  }

  function setTempRet0() {
    return tempRet0;
  }

  // typedef struct TableEntry {
  //     uintptr_t id;
  //     uint32_t label;
  //   } TableEntry;

  // TableEntry* saveSetjmp(uintptr_t* env, uint32_t label, TableEntry* table, uint32_t size) {
  //     // Not particularly fast: slow table lookup of setjmpId to label. But setjmp
  //     // prevents relooping anyhow, so slowness is to be expected. And typical case
  //     // is 1 setjmp per invocation, or less.
  //     uint32_t i = 0;
  //     setjmpId++;
  //     *env = setjmpId;
  //     while (i < size) {
  //       if (table[i].id == 0) {
  //         table[i].id = setjmpId;
  //         table[i].label = label;
  //         // prepare next slot
  //         table[i + 1].id = 0;
  //         setTempRet0(size);
  //         return table;
  //       }
  //       i++;
  //     }
  //     // grow the table
  //     size *= 2;
  //     table = (TableEntry*)realloc(table, sizeof(TableEntry) * (size +1));
  //     table = saveSetjmp(env, label, table, size);
  //     setTempRet0(size); // FIXME: unneeded?
  //     return table;
  //   }

  function saveSetjmp(env: number, label: number, table: number, size: number) {
    console.debug("saveSetjmp", env, label, table, size);
    setjmpId++;

    const envBuffer = new Uint32Array(memory.buffer, env, 1);
    envBuffer[0] = setjmpId;

    const tableBuffer = new Uint32Array(memory.buffer, table, size * 2);

    let i = 0;
    while (i < size) {
      const id = tableBuffer[i * 2];
      if (id === 0) {
        tableBuffer[i * 2] = setjmpId;
        tableBuffer[i * 2 + 1] = label;
        // prepare next slot
        tableBuffer[(i + 1) * 2] = 0;
        tempRet0 = size;
        return table;
      }
      i++;
    }

    size *= 2;
    free(table);
    table = malloc((size + 1) * 8);
    console.log("again saveSetjmp", table, size);
    table = saveSetjmp(env, label, table, size);
    tempRet0 = size; // FIXME: unneeded?
    return table;
  }

  // uint32_t testSetjmp(uintptr_t id, TableEntry* table, uint32_t size) {
  //     uint32_t i = 0;
  //     while (i < size) {
  //       uintptr_t curr = table[i].id;
  //       if (curr == 0) break;
  //       if (curr == id) {
  //         return table[i].label;
  //       }
  //       i++;
  //     }
  //     return 0;
  //   }

  function testSetjmp(id: number, table: number, size: number) {
    console.debug("testSetjmp", id, table, size);
    const tableBuffer = new Uint32Array(memory.buffer, table, size * 2);

    let i = 0;
    while (i < size) {
      const curr = tableBuffer[i * 2];
      if (curr === 0) break;
      if (curr === id) {
        return tableBuffer[i * 2 + 1];
      }
      i++;
    }
    return 0;
  }

  return { saveSetjmp, testSetjmp, getTempRet0, setTempRet0 };
}
