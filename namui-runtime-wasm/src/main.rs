use std::ffi::c_void;

#[tokio::main]
async fn main() {
    real_main().await;
}

async fn real_main() {
    println!("Hello, world!");
    tokio::task::spawn(async move {
        println!("Hello from a thread!");
    })
    .await
    .unwrap();

    let interface = skia_safe::gpu::gl::Interface::new_load_with(|addr| match addr {
        "glGetString" => glGetString as _,
        "glGetStringi" => glGetStringi as _,
        "glGetIntegerv" => glGetIntegerv as _,
        _ => todo!("unknown function on gl interface: {}", addr),
    })
    .expect("failed to load gl interface");

    println!("good!, interface: {:?}", interface);

    let mut context = skia_safe::gpu::direct_contexts::make_gl(interface, None)
        .expect("failed to create gl direct context");
    println!("context");

    let framebuffer_info = {
        let mut fboid: i32 = 0;
        unsafe {
            glGetIntegerv(
                0x8ca6, // gl::FRAMEBUFFER_BINDING
                &mut fboid,
            )
        };

        skia_safe::gpu::gl::FramebufferInfo {
            fboid: fboid.try_into().unwrap(),
            format: skia_safe::gpu::gl::Format::RGBA8.into(),
            protected: skia_safe::gpu::Protected::No,
        }
    };

    let backend_render_target =
        skia_safe::gpu::backend_render_targets::make_gl((100, 100), 1, 0, framebuffer_info);
    println!("backend_render_target");

    let mut surface = skia_safe::gpu::surfaces::wrap_backend_render_target(
        &mut context,
        &backend_render_target,
        skia_safe::gpu::SurfaceOrigin::TopLeft,
        skia_safe::ColorType::RGBA8888,
        None,
        None,
    )
    .expect("failed to wrap backend render target");
    println!("surface");

    surface.canvas().clear(skia_safe::Color::BLACK);
    println!("canvas clear to black");
    context.flush(None);
    println!("context flush");

    surface.canvas().draw_line(
        (1, 1),
        (50, 50),
        &skia_safe::paint::Paint::new(skia_safe::Color4f::new(1.0, 0.0, 0.0, 1.0), None),
    );
    println!("canvas clear to black");
    context.flush(None);
    println!("context flush");
}

extern "C" {
    // GL_API const GLubyte *GL_APIENTRY glGetString (GLenum name);
    pub fn glGetString(name: u32) -> *const u8;
    // WEBGL_APICALL const GLubyte *GL_APIENTRY emscripten_glGetStringi (GLenum name, GLuint index);
    pub fn glGetStringi(name: u32, index: u32) -> *const u8;
    //GL_API void GL_APIENTRY glGetIntegerv (GLenum pname, GLint *data);
    pub fn glGetIntegerv(pname: u32, data: *mut i32);

}

const ALIGN: usize = 4;
#[no_mangle]
pub extern "C" fn _malloc(size: usize) -> *mut c_void {
    println!("malloc: {:?}", size);
    // make sure, result should be power of 2

    unsafe {
        let aligned_size = (size + (ALIGN - 1)) & !(ALIGN - 1); // round up to nearest multiple of align
        let layout = std::alloc::Layout::from_size_align(aligned_size, ALIGN).unwrap();
        println!("layout: {:?}", layout);
        let buf = std::alloc::alloc(layout);
        println!("buf: {:?}", buf);
        buf as *mut c_void
    }
}

#[no_mangle]
pub extern "C" fn _free(ptr: *mut c_void) {
    println!("free: {:?}", ptr);
    unsafe {
        std::alloc::dealloc(
            ptr as *mut u8,
            std::alloc::Layout::from_size_align(0, ALIGN).unwrap(),
        );
    }
}
