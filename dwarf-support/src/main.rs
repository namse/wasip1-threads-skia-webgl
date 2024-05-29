use anyhow::Result;
use std::{fs, io::Write, path::Path, process};

/// https://github.com/emscripten-core/emscripten/blob/main/tools/building.py#L988
fn main() -> Result<()> {
    let wasm_file_with_dwarf = Path::new(
        "../namui-runtime-wasm/target/wasm32-wasip1-threads/debug/namui-runtime-wasm.wasm",
    );

    let wasm_file_without_dwarf = Path::new(
        "../namui-runtime-wasm/target/wasm32-wasip1-threads/debug/namui-runtime-wasm-stripped.wasm",
    );

    strip(wasm_file_with_dwarf, wasm_file_without_dwarf)?;

    //   def emit_debug_on_side(wasm_file, wasm_file_with_dwarf):
    //     embedded_path = settings.SEPARATE_DWARF_URL
    //     if not embedded_path:
    //         # a path was provided - make it relative to the wasm.
    //         embedded_path = os.path.relpath(wasm_file_with_dwarf,
    //                                         os.path.dirname(wasm_file))
    //         # normalize the path to use URL-style separators, per the spec
    //         embedded_path = utils.normalize_path(embedded_path)

    //     shutil.move(wasm_file, wasm_file_with_dwarf)
    //     strip(wasm_file_with_dwarf, wasm_file, debug=True)

    //     # embed a section in the main wasm to point to the file with external DWARF,
    //     # see https://yurydelendik.github.io/webassembly-dwarf/#external-DWARF
    //     section_name = b'\x13external_debug_info' # section name, including prefixed size
    //     filename_bytes = embedded_path.encode('utf-8')
    //     contents = webassembly.to_leb(len(filename_bytes)) + filename_bytes
    //     section_size = len(section_name) + len(contents)
    //     with open(wasm_file, 'ab') as f:
    //         f.write(b'\0') # user section is code 0
    //         f.write(webassembly.to_leb(section_size))
    //         f.write(section_name)
    //         f.write(contents)

    let section_name = b"\x13external_debug_info";

    let embedded_path = "http://localhost:3000/wasm/debug";
    let embedded_path_bytes = embedded_path.as_bytes();
    let contents = {
        let mut contents = to_leb(embedded_path_bytes.len() as u32);
        contents.extend(embedded_path_bytes);
        contents
    };
    let section_size = section_name.len() + contents.len();

    let mut file = fs::OpenOptions::new()
        .append(true)
        .open(wasm_file_without_dwarf)?;

    file.write_all(b"\0")?;
    file.write_all(&to_leb(section_size as u32))?;
    file.write_all(section_name)?;
    file.write_all(&contents)?;

    Ok(())
}

pub fn to_leb(mut value: u32) -> Vec<u8> {
    let mut leb128 = Vec::new();
    loop {
        let mut byte = (value & 0x7F) as u8;
        value >>= 7;
        if value != 0 {
            byte |= 0x80;
        }
        leb128.push(byte);
        if value == 0 {
            break;
        }
    }
    leb128
}

// def strip(infile, outfile, debug=False, sections=None):
//   """Strip DWARF and/or other specified sections from a wasm file"""
//   cmd = [LLVM_OBJCOPY, infile, outfile]
//   if debug:
//     cmd += ['--remove-section=.debug*']
//   if sections:
//     cmd += ['--remove-section=' + section for section in sections]
//   check_call(cmd)

fn strip(from: &Path, to: &Path) -> Result<()> {
    process::Command::new("/opt/wasi-sdk/bin/llvm-objcopy")
        .args([
            from.to_str().unwrap(),
            to.to_str().unwrap(),
            "--remove-section=.debug*",
        ])
        .output()?;

    Ok(())
}
