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

    let backend_render_target = skia_safe::gpu::backend_render_targets::make_gl(
        (100, 100),
        1,
        0,
        skia_safe::gpu::gl::FramebufferInfo::default(),
    );

    let surface = skia_safe::gpu::surfaces::wrap_backend_render_target(
        &mut context,
        &backend_render_target,
        skia_safe::gpu::SurfaceOrigin::TopLeft,
        skia_safe::ColorType::RGBA8888,
        None,
        None,
    )
    .expect("failed to wrap backend render target");
}

extern "C" {
    // GL_API const GLubyte *GL_APIENTRY glGetString (GLenum name);
    pub fn glGetString(name: u32) -> *const u8;
    // WEBGL_APICALL const GLubyte *GL_APIENTRY emscripten_glGetStringi (GLenum name, GLuint index);
    pub fn glGetStringi(name: u32, index: u32) -> *const u8;
    //GL_API void GL_APIENTRY glGetIntegerv (GLenum pname, GLint *data);
    pub fn glGetIntegerv(pname: u32, data: *mut i32);

}

#[no_mangle]
pub extern "C" fn _malloc(size: usize) -> *mut c_void {
    let layout = std::alloc::Layout::from_size_align(size, 1).unwrap();
    unsafe { std::alloc::alloc(layout) as *mut c_void }
}

#[no_mangle]
pub extern "C" fn _free(ptr: *mut c_void) {
    let layout = std::alloc::Layout::from_size_align(1, 1).unwrap();
    unsafe { std::alloc::dealloc(ptr as *mut u8, layout) }
}
