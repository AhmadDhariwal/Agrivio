export interface AgrivioVitestNodeDefaults {
  watch: false;
  globals: true;
  environment: 'node';
  reporters: ['default'];
  coverage: {
    provider: 'v8';
  };
}

export declare const agrivioVitestNodeDefaults: AgrivioVitestNodeDefaults;
declare const _default: AgrivioVitestNodeDefaults;
export default _default;
