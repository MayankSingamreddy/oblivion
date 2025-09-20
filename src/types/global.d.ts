// Global type declarations
declare namespace NodeJS {
  interface Timeout {
    ref(): this;
    unref(): this;
  }
}

// Make timeout compatible with browser and Node
declare type TimeoutId = NodeJS.Timeout | number;
