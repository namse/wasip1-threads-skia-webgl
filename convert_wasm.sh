INPUT_WASM_PATH=./namui-runtime-wasm/target/wasm32-wasip1-threads/debug/namui-runtime-wasm.wasm

wasm-tools print $INPUT_WASM_PATH \
    -o out.wat

/opt/wasi-sdk/bin/llvm-dwarfdump \
    -debug-info \
    -debug-line \
    --recurse-depth=0 \
    $INPUT_WASM_PATH \
    -o namui-runtime-wasm.dwarf

python3 /opt/emscripten/tools/wasm-sourcemap.py \
    --dwarfdump-output namui-runtime-wasm.dwarf \
    $INPUT_WASM_PATH \
    --output namui-runtime-wasm.wasm.sourcemap \
    -u http://localhost:3000/namui-runtime-wasm.wasm.sourcemap \
    -w namui-runtime-wasm.wasm
