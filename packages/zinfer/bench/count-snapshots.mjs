import { writeFileSync } from "node:fs";
import { API } from "typescript-native/sync";

// The API caches createSnapshot on the instance after the first access, so a
// prototype getter wrapper has to re-define the cached method to keep counting.
const descriptor = Object.getOwnPropertyDescriptor(API.prototype, "createSnapshot");
let created = 0;

Object.defineProperty(API.prototype, "createSnapshot", {
  configurable: true,
  get() {
    const method = descriptor.get.call(this);
    const counted = Object.assign(
      (...args) => {
        created++;
        return method(...args);
      },
      { gen: method.gen },
    );
    Object.defineProperty(this, "createSnapshot", { configurable: true, value: counted });
    return counted;
  },
});

process.on("exit", () => writeFileSync(process.env.ZINFER_BENCH_COUNT_FILE, String(created)));
