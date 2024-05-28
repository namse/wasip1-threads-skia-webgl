use super::{generic, prelude::*};

pub struct Wasm32Wasip1Threads;

impl PlatformDetails for Wasm32Wasip1Threads {
    fn uses_freetype(&self, _config: &BuildConfiguration) -> bool {
        true
    }

    fn gn_args(&self, config: &BuildConfiguration, builder: &mut GnArgsBuilder) {
        let features = &config.features;

        gn_args(config, builder);

        builder
            .arg("target_cpu", quote("wasm"))
            .arg("skia_gl_standard", quote("webgl"))
            .arg("skia_use_webgl", yes_if(features.gpu()))
            .arg("skia_use_no_png_encode", yes())
            .arg("skia_use_libpng_decode", no())
            // skia_enable_graphite
            // .arg("skia_use_dawn", yes())
            .cflags(clang_flags());
    }

    fn bindgen_args(&self, _target: &Target, builder: &mut BindgenArgsBuilder) {
        builder.args(bindgen_flags())
    }

    fn link_libraries(&self, features: &Features) -> Vec<String> {
        link_libraries(features)
    }
}

pub fn gn_args(config: &BuildConfiguration, builder: &mut GnArgsBuilder) {
    generic::gn_args(config, builder);
}

pub fn link_libraries(features: &Features) -> Vec<String> {
    // let mut libs = vec![
        // "stdc++",
        // // "fontconfig",
        // // "freetype",
        // "wasi-emulated-mman",
        // "setjmp",
    // ];

    // if skia::env::use_system_libraries() {
    //     libs.push("png16");
    //     libs.push("z");
    //     libs.push("icudata");
    //     libs.push("icui18n");
    //     libs.push("icuio");
    //     libs.push("icutest");
    //     libs.push("icutu");
    //     libs.push("icuuc");
    //     libs.push("harfbuzz");
    //     libs.push("expat");

    //     if features.webp_encode || features.webp_decode {
    //         libs.push("webp");
    //     }
    // }

    // if skia::env::use_system_libraries() || cfg!(feature = "use-system-jpeg-turbo") {
    //     libs.push("jpeg");
    // }

    // libs.iter().map(|l| l.to_string()).collect()
    vec![
    ]
}
fn clang_flags() -> Vec<String> {
    vec![
        format!("-I/opt/wasi-sdk/lib/clang/18/include"),
        format!("-I/home/ubuntu/emscripten/system/include"),
        format!("-mllvm"),
        format!("-wasm-enable-sjlj"),
        format!("--sysroot=/opt/wasi-sdk/share/wasi-sysroot"),
        format!("-DSK_BUILD_FOR_UNIX"),
        format!("-mtail-call"),
        format!("-D_WASI_EMULATED_MMAN"),
        // -Wno-error=register?
        // format!("-xc++"),
        format!("-fvisibility=default"), // https://github.com/rust-lang/rust-bindgen/issues/2624#issuecomment-1708117271
        format!("-pthread"),
        format!("-Xclang"),
        format!("-target-feature"),
        format!("-Xclang"),
        format!("+atomics"),
        format!("-Xclang"),
        format!("-target-feature"),
        format!("-Xclang"),
        format!("+bulk-memory"),
        format!("-Xclang"),
        format!("-target-feature"),
        format!("-Xclang"),
        format!("+mutable-globals"),
        format!("-D__EMSCRIPTEN__"),
    ]
}

fn bindgen_flags() -> Vec<String> {
    vec![
        format!("--sysroot=/opt/wasi-sdk/share/wasi-sysroot"),
        // format!("-I/opt/wasi-sdk/lib/clang/18/include"),
        // format!("-I/opt/wasi-sdk/share/wasi-sysroot/include/wasm32-wasip1-threads/c++/v1"),
        format!("-mllvm"),
        format!("-wasm-enable-sjlj"),
        format!("-DSK_BUILD_FOR_UNIX"),
        format!("-mtail-call"),
        format!("-D_WASI_EMULATED_MMAN"),
        format!("-xc++"),
        format!("-fvisibility=default"), // https://github.com/rust-lang/rust-bindgen/issues/2624#issuecomment-1708117271
        format!("-pthread"),
        format!("-Xclang"),
        format!("-target-feature"),
        format!("-Xclang"),
        format!("+atomics"),
        format!("-Xclang"),
        format!("-target-feature"),
        format!("-Xclang"),
        format!("+bulk-memory"),
        format!("-Xclang"),
        format!("-target-feature"),
        format!("-Xclang"),
        format!("+mutable-globals"),
        format!("-D__EMSCRIPTEN__"),
    ]
}
