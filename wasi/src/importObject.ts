const MEMORY64 = 1;
const POINTER_SIZE = MEMORY64 ? 8 : 4;
const POINTER_MAX = MEMORY64 ? "Number.MAX_SAFE_INTEGER" : "0xFFFFFFFF";
const STACK_ALIGN = 16;
const POINTER_BITS = POINTER_SIZE * 8;
const POINTER_TYPE = `u${POINTER_BITS}`;
const WASM_BIGINT = true;
// Whether we may be accessing the address 2GB or higher. If so, then we need
// to interpret incoming i32 pointers as unsigned.
//
// This setting does not apply (and is never set to true) under MEMORY64, since
// in that case we get 64-bit pointers coming through to JS (converting them to
// i53 in most cases).
const CAN_ADDRESS_2GB = false;
const ASSERTIONS = 2;
let fixedFunctionProgram: any = null;

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
  return {
    env: {
      memory: importMemory,
      ...envGl({
        malloc,
        free,
        webgl,
        memory,
      }),
      ...implSetJmp({
        memory,
        malloc,
        free,
      }),
      ...implMath({
        memory,
        malloc,
      }),
    },
    wasi_snapshot_preview1: wasiImport,
    wasi: {
      "thread-spawn": (start_arg_ptr: number) => {
        const tid = Atomics.add(new Uint32Array(nextTid), 0, 1);
        self.postMessage({
          tid,
          nextTid,
          importMemory,
          module,
          start_arg_ptr,
        });

        return tid;
      },
    },
    imports: {},
  };
}

function envGl({
  malloc,
  free,
  webgl,
  memory,
}: {
  malloc: (size: number) => number;
  free: (ptr: number) => void;
  webgl: WebGL2RenderingContext | undefined;
  memory: WebAssembly.Memory;
}) {
  const stringCache: Record<number, number> = {};

  function stringToNewUTF8(string: string) {
    const bytes = new TextEncoder().encode(string);
    const ptr = malloc(bytes.length + 1);
    const buffer = new Uint8Array(memory.buffer);
    buffer.set(bytes, ptr);
    buffer[ptr + bytes.length] = 0;
    return ptr;
  }

  return {
    glGetStringi: () => {
      return webgl!.getStringi();
    },
    glGetIntegerv: (pname: number, params: number) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      switch (pname) {
        case 0x8b8d: {
          // GL_CURRENT_PROGRAM
          // Just query directly so we're working with WebGL objects.
          var cur = webgl.getParameter(webgl.CURRENT_PROGRAM);
          if (cur == fixedFunctionProgram) {
            // Pretend we're not using a program.

            setValue(memory, params, 0, 0, "i32");
            return;
          }
          break;
        }
      }
    },
    glGetString: (name: number) => {
      console.debug("glGetString", name.toString(16));
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      let ret = stringCache[name];
      if (ret) {
        return ret;
      }
      switch (name) {
        case 0x1f03 /* GL_EXTENSIONS */:
          ret = stringToNewUTF8(webgl.getSupportedExtensions()!.join(" "));
          break;
        case 0x1f00 /* GL_VENDOR */:
        case 0x1f01 /* GL_RENDERER */:
        case 0x9245 /* UNMASKED_VENDOR_WEBGL */:
        case 0x9246 /* UNMASKED_RENDERER_WEBGL */:
          const paramter = webgl.getParameter(name);
          console.debug("paramter", paramter);

          if (!paramter) {
            // This occurs e.g. if one attempts GL_UNMASKED_VENDOR_WEBGL when it is not supported.
            throw new Error(
              `GL_INVALID_ENUM in glGetString: Received empty parameter for query name ${name}!`
            );
          }

          ret = stringToNewUTF8(paramter);
          break;
        case 0x1f02 /* GL_VERSION */:
          let glVersion = webgl.getParameter(0x1f02 /*GL_VERSION*/);
          // return GLES version string corresponding to the version of the WebGL context
          glVersion = `OpenGL ES 3.0 (${glVersion})`;
          console.debug("glVersion", glVersion);
          ret = stringToNewUTF8(glVersion);
          break;
        case 0x8b8c /* GL_SHADING_LANGUAGE_VERSION */:
          let glslVersion = webgl.getParameter(
            0x8b8c /*GL_SHADING_LANGUAGE_VERSION*/
          );
          // extract the version number 'N.M' from the string 'WebGL GLSL ES N.M ...'
          const ver_re = /^WebGL GLSL ES ([0-9]\.[0-9][0-9]?)(?:$| .*)/;
          const ver_num = glslVersion.match(ver_re);
          if (ver_num !== null) {
            if (ver_num[1].length == 3) ver_num[1] = ver_num[1] + "0"; // ensure minor version has 2 digits
            glslVersion = `OpenGL ES GLSL ES ${ver_num[1]} (${glslVersion})`;
          }
          ret = stringToNewUTF8(glslVersion);
          break;
        default:
          throw new Error(
            `GL_INVALID_ENUM in glGetString: Unknown parameter ${name}!`
          );
      }
      stringCache[name] = ret;
      return ret;
    },
    glUniform1fv: () => {
      throw new Error("not implemented");
      // return webgl!.uniform1fv();
    },
    glUniform1f: () => {
      throw new Error("not implemented");
      // return webgl!.uniform1f();
    },
    glTexSubImage2D: () => {
      throw new Error("not implemented");
      // return webgl!.texSubImage2D();
    },
    glTexParameteriv: () => {
      throw new Error("not implemented");
      // return webgl!.texParameteriv();
    },
    glTexParameteri: () => {
      throw new Error("not implemented");
      // return webgl!.texParameteri();
    },
    glTexParameterfv: () => {
      throw new Error("not implemented");
      // return webgl!.texParameterfv();
    },
    glTexParameterf: () => {
      throw new Error("not implemented");
      // return webgl!.texParameterf();
    },
    glTexImage2D: () => {
      throw new Error("not implemented");
      // return webgl!.texImage2D();
    },
    glStencilOpSeparate: () => {
      throw new Error("not implemented");
      // return webgl!.stencilOpSeparate();
    },
    glStencilOp: () => {
      throw new Error("not implemented");
      // return webgl!.stencilOp();
    },
    glStencilMaskSeparate: () => {
      throw new Error("not implemented");
      // return webgl!.stencilMaskSeparate();
    },
    glStencilMask: () => {
      throw new Error("not implemented");
      // return webgl!.stencilMask();
    },
    glStencilFuncSeparate: () => {
      throw new Error("not implemented");
      // return webgl!.stencilFuncSeparate();
    },
    glStencilFunc: () => {
      throw new Error("not implemented");
      // return webgl!.stencilFunc();
    },
    glShaderSource: () => {
      throw new Error("not implemented");
      // return webgl!.shaderSource();
    },
    glScissor: () => {
      throw new Error("not implemented");
      // return webgl!.scissor();
    },
    glReadPixels: () => {
      throw new Error("not implemented");
      // return webgl!.readPixels();
    },
    glPixelStorei: (pname: number, param: number) => {
      return webgl!.pixelStorei(pname, param);
    },
    glLinkProgram: () => {
      throw new Error("not implemented");
      // return webgl!.linkProgram();
    },
    glLineWidth: (width: number) => {
      return webgl!.lineWidth(width);
    },
    glIsTexture: () => {
      throw new Error("not implemented");
      // return webgl!.isTexture();
    },
    glGetUniformLocation: () => {
      throw new Error("not implemented");
      // return webgl!.getUniformLocation();
    },
    glGetShaderiv: () => {
      throw new Error("not implemented");
      // return webgl!.getShaderiv();
    },
    glGetShaderInfoLog: () => {
      throw new Error("not implemented");
      // return webgl!.getShaderInfoLog();
    },
    glGetProgramiv: () => {
      throw new Error("not implemented");
      // return webgl!.getProgramiv();
    },
    glGetProgramInfoLog: () => {
      throw new Error("not implemented");
      // return webgl!.getProgramInfoLog();
    },
    glGetFloatv: () => {
      throw new Error("not implemented");
      // return webgl!.getFloatv();
    },
    glGetError: () => {
      return webgl!.getError();
    },
    glGetBufferParameteriv: () => {
      throw new Error("not implemented");
      // return webgl!.getBufferParameteriv();
    },
    glGenTextures: () => {
      throw new Error("not implemented");
      // return webgl!.genTextures();
    },
    glGenBuffers: () => {
      throw new Error("not implemented");
      // return webgl!.genBuffers();
    },
    glFrontFace: (mode: number) => {
      return webgl!.frontFace(mode);
    },
    glFlush: () => {
      return webgl!.flush();
    },
    glFinish: () => {
      return webgl!.finish();
    },
    glEnableVertexAttribArray: (index: number) => {
      return webgl!.enableVertexAttribArray(index);
    },
    glEnable: (cap: number) => {
      return webgl!.enable(cap);
    },
    glDrawElements: (
      mode: number,
      count: number,
      type: number,
      offset: number
    ) => {
      return webgl!.drawElements(mode, count, type, offset);
    },
    glDrawArrays: (mode: number, first: number, count: number) => {
      return webgl!.drawArrays(mode, first, count);
    },
    glDisableVertexAttribArray: (index: number) => {
      return webgl!.disableVertexAttribArray(index);
    },
    glDisable: (cap: number) => {
      return webgl!.disable(cap);
    },
    glDepthMask: (flag: number) => {
      return webgl!.depthMask(!!flag);
    },
    glDeleteTextures: () => {
      throw new Error("not implemented");
      // return webgl!.deleteTextures();
    },
    glDeleteShader: () => {
      throw new Error("not implemented");
      // return webgl!.deleteShader();
    },
    glDeleteProgram: () => {
      throw new Error("not implemented");
      // return webgl!.deleteProgram();
    },
    glDeleteBuffers: () => {
      throw new Error("not implemented");
      // return webgl!.deleteBuffers();
    },
    glCullFace: (mode: number) => {
      return webgl!.cullFace(mode);
    },
    glCreateShader: (type: number) => {
      throw new Error("not implemented");
      // return webgl!.createShader(type);
    },
    glCreateProgram: () => {
      throw new Error("not implemented");
      // return webgl!.createProgram();
    },
    glCopyTexSubImage2D: (
      target: number,
      level: number,
      xoffset: number,
      yoffset: number,
      x: number,
      y: number,
      width: number,
      height: number
    ) => {
      return webgl!.copyTexSubImage2D(
        target,
        level,
        xoffset,
        yoffset,
        x,
        y,
        width,
        height
      );
    },
    glCompressedTexSubImage2D: (
      target: number,
      level: number,
      xoffset: number,
      yoffset: number,
      width: number,
      height: number,
      format: number,
      imageSize: number,
      offset: number
    ) => {
      return webgl!.compressedTexSubImage2D(
        target,
        level,
        xoffset,
        yoffset,
        width,
        height,
        format,
        imageSize,
        offset
      );
    },
    glCompressedTexImage2D: (
      target: number,
      level: number,
      internalformat: number,
      width: number,
      height: number,
      border: number,
      imageSize: number,
      offset: number
    ) => {
      return webgl!.compressedTexImage2D(
        target,
        level,
        internalformat,
        width,
        height,
        border,
        imageSize,
        offset
      );
    },
    glCompileShader: () => {
      throw new Error("not implemented");
      // return webgl!.compileShader();
    },
    glColorMask: (red: number, green: number, blue: number, alpha: number) => {
      return webgl!.colorMask(!!red, !!green, !!blue, !!alpha);
    },
    glClearStencil: (s: number) => {
      return webgl!.clearStencil(s);
    },
    glClearColor: (red: number, green: number, blue: number, alpha: number) => {
      return webgl!.clearColor(red, green, blue, alpha);
    },
    glClear: (mask: number) => {
      return webgl!.clear(mask);
    },
    glBufferSubData: () => {
      throw new Error("not implemented");
      // return webgl!.bufferSubData();
    },
    glBufferData: () => {
      return webgl!.bufferData();
    },
    glBlendFunc: () => {
      return webgl!.blendFunc();
    },
    glBlendEquation: () => {
      return webgl!.blendEquation();
    },
    glBlendColor: () => {
      return webgl!.blendColor();
    },
    glBindTexture: () => {
      throw new Error("not implemented");
      // return webgl!.bindTexture();
    },
    glBindBuffer: () => {
      throw new Error("not implemented");
      // return webgl!.bindBuffer();
    },
    glBindAttribLocation: () => {
      throw new Error("not implemented");
      // return webgl!.bindAttribLocation();
    },
    glAttachShader: () => {
      throw new Error("not implemented");
      // return webgl!.attachShader();
    },
    glActiveTexture: () => {
      return webgl!.activeTexture();
    },
    glUniform2fv: () => {
      throw new Error("not implemented");
      // return webgl!.uniform2fv();
    },
    glUniform2f: () => {
      throw new Error("not implemented");
      // return webgl!.uniform2f();
    },
    glUniform1iv: () => {
      throw new Error("not implemented");
      // return webgl!.uniform1iv();
    },
    glUniform1i: () => {
      throw new Error("not implemented");
      // return webgl!.uniform1i();
    },
    glUniform2i: () => {
      throw new Error("not implemented");
      // return webgl!.uniform2i();
    },
    glUniform2iv: () => {
      throw new Error("not implemented");
      // return webgl!.uniform2iv();
    },
    glUniform3f: () => {
      throw new Error("not implemented");
      // return webgl!.uniform3f();
    },
    glUniform3fv: () => {
      throw new Error("not implemented");
      // return webgl!.uniform3fv();
    },
    glUniform3i: () => {
      throw new Error("not implemented");
      // return webgl!.uniform3i();
    },
    glUniform3iv: () => {
      throw new Error("not implemented");
      // return webgl!.uniform3iv();
    },
    glUniform4f: webgl?.uniform4f || (() => {}),
    glUniform4fv: () => {
      throw new Error("not implemented");
      // return webgl!.uniform4fv();
    },
    glViewport: webgl?.viewport || (() => {}),
    glVertexAttribPointer: webgl?.vertexAttribPointer || (() => {}),
    glVertexAttrib4fv: () => {
      throw new Error("not implemented");
      // return webgl!.vertexAttrib4fv();
    },
    glVertexAttrib3fv: () => {
      throw new Error("not implemented");
      // return webgl!.vertexAttrib3fv();
    },
    glVertexAttrib2fv: () => {
      throw new Error("not implemented");
      // return webgl!.vertexAttrib2fv();
    },
    glVertexAttrib1f: () => {
      throw new Error("not implemented");
      // return webgl!.vertexAttrib1f();
    },
    glUseProgram: () => {
      throw new Error("not implemented");
      // return webgl!.useProgram();
    },
    glUniformMatrix4fv: () => {
      throw new Error("not implemented");
      // return webgl!.uniformMatrix4fv();
    },
    glUniformMatrix3fv: () => {
      throw new Error("not implemented");
      // return webgl!.uniformMatrix3fv();
    },
    glUniformMatrix2fv: () => {
      throw new Error("not implemented");
      // return webgl!.uniformMatrix2fv();
    },
    glUniform4iv: () => {
      throw new Error("not implemented");
      // return webgl!.uniform4iv();
    },
    glUniform4i: () => {
      throw new Error("not implemented");
      // return webgl!.uniform4i();
    },
    glGenVertexArraysOES: () => {
      throw new Error("not implemented");
      // return webgl!.genVertexArraysOES();
    },
    glDeleteVertexArraysOES: () => {
      throw new Error("not implemented");
      // return webgl!.deleteVertexArraysOES();
    },
    glBindVertexArrayOES: () => {
      throw new Error("not implemented");
      // return webgl!.bindVertexArrayOES();
    },
    glGenVertexArrays: () => {
      throw new Error("not implemented");
      // return webgl!.genVertexArrays();
    },
    glDeleteVertexArrays: () => {
      throw new Error("not implemented");
      // return webgl!.deleteVertexArrays();
    },
    glBindVertexArray: () => {
      throw new Error("not implemented");
      // return webgl!.bindVertexArray();
    },
    glDrawElementsInstanced: () => {
      throw new Error("not implemented");
      // return webgl!.drawElementsInstanced();
    },
    glDrawArraysInstanced: webgl?.drawArraysInstanced || (() => {}),
    glDrawElementsInstancedBaseVertexBaseInstanceWEBGL: () => {
      throw new Error("not implemented");
    },
    glDrawArraysInstancedBaseInstanceWEBGL: () => {
      throw new Error("not implemented");
    },
    glReadBuffer: webgl?.readBuffer || (() => {}),
    glDrawBuffers: () => {
      throw new Error("not implemented");
      // return webgl!.drawBuffers();
    },
    glMultiDrawElementsInstancedBaseVertexBaseInstanceWEBGL: () => {
      throw new Error("not implemented");
    },
    glMultiDrawArraysInstancedBaseInstanceWEBGL: () => {
      throw new Error("not implemented");
    },
    glVertexAttribIPointer: webgl?.vertexAttribIPointer || (() => {}),
    glVertexAttribDivisor: webgl?.vertexAttribDivisor || (() => {}),
    glTexStorage2D: webgl?.texStorage2D || (() => {}),
    glDrawRangeElements: webgl?.drawRangeElements || (() => {}),
    glGenRenderbuffers: () => {
      throw new Error("not implemented");
      // return webgl!.createRenderbuffer();
    },
    glGenFramebuffers: () => {
      throw new Error("not implemented");
      // return webgl!.genFramebuffers();
    },
    glFramebufferTexture2D: () => {
      throw new Error("not implemented");
      // return webgl!.framebufferTexture2D();
    },
    glFramebufferRenderbuffer: () => {
      throw new Error("not implemented");
      // return webgl!.framebufferRenderbuffer();
    },
    glDeleteRenderbuffers: () => {
      throw new Error("not implemented");
      // return webgl!.deleteRenderbuffers();
    },
    glDeleteFramebuffers: () => {
      throw new Error("not implemented");
      // return webgl!.deleteFramebuffers();
    },
    glCheckFramebufferStatus: webgl?.checkFramebufferStatus || (() => {}),
    glBindRenderbuffer: () => {
      throw new Error("not implemented");
      // return webgl!.bindRenderbuffer();
    },
    glBindFramebuffer: () => {
      throw new Error("not implemented");
      // return webgl!.bindFramebuffer();
    },
    glRenderbufferStorage: webgl?.renderbufferStorage || (() => {}),
    glGetRenderbufferParameteriv: () => {
      throw new Error("not implemented");
      // return webgl!.getRenderbufferParameteriv();
    },
    glGetFramebufferAttachmentParameteriv: () => {
      throw new Error("not implemented");
      // return webgl!.getFramebufferAttachmentParameteriv();
    },
    glGenerateMipmap: webgl?.generateMipmap || (() => {}),
    glRenderbufferStorageMultisample:
      webgl?.renderbufferStorageMultisample || (() => {}),
    glBlitFramebuffer: webgl?.blitFramebuffer || (() => {}),
    glDeleteSync: () => {
      throw new Error("not implemented");
      // return webgl!.deleteSync();
    },
    glClientWaitSync: () => {
      throw new Error("not implemented");
      // return webgl!.clientWaitSync();
    },
    glCopyBufferSubData: webgl?.copyBufferSubData || (() => {}),
    glWaitSync: () => {
      throw new Error("not implemented");
      // return webgl!.waitSync();
    },
    glIsSync: () => {
      throw new Error("not implemented");
      // return webgl!.isSync();
    },
    glFenceSync: () => {
      throw new Error("not implemented");
      // return webgl!.fenceSync();
    },
    glSamplerParameteriv: () => {
      throw new Error("not implemented");
      // return webgl!.samplerParameteriv();
    },
    glSamplerParameteri: () => {
      throw new Error("not implemented");
      // return webgl!.samplerParameteri();
    },
    glSamplerParameterf: () => {
      throw new Error("not implemented");
      // return webgl!.samplerParameterf();
    },
    glGenSamplers: () => {
      throw new Error("not implemented");
      // return webgl!.genSamplers();
    },
    glDeleteSamplers: () => {
      throw new Error("not implemented");
      // return webgl!.deleteSamplers();
    },
    glBindSampler: () => {
      throw new Error("not implemented");
      // return webgl!.bindSampler();
    },
    glInvalidateSubFramebuffer: () => {
      throw new Error("not implemented");
      // return webgl!.invalidateSubFramebuffer();
    },
    glInvalidateFramebuffer: () => {
      throw new Error("not implemented");
      // return webgl!.invalidateFramebuffer();
    },
    glGetShaderPrecisionFormat: (
      shaderType: number,
      precisionType: number,
      range: number,
      precision: number
    ) => {
      const result = webgl!.getShaderPrecisionFormat(
        shaderType,
        precisionType
      )!;
      setValue(memory, range, 0, result.rangeMin, "i32");
      setValue(memory, range, 4, result.rangeMax, "i32");
      setValue(memory, precision, 0, result.precision, "i32");
    },
  };
}

/**
 * @param {number} ptr The pointer. Used to find both the slab and the offset in that slab. If the pointer
 *            is just an integer, then this is almost redundant, but in general the pointer type
 *            may in the future include information about which slab as well. So, for now it is
 *            possible to put |0| here, but if a pointer is available, that is more future-proof.
 * @param {number} pos The position in that slab - the offset. Added to any offset in the pointer itself.
 * @param {number} value The value to set.
 * @param {string} type A string defining the type. Used to find the slab (HEAPU8, HEAP16, HEAPU32, etc.).
 *             which means we should write to all slabs, ignore type differences if any on reads, etc.
 */
function setValue(
  memory: WebAssembly.Memory,
  ptr: number,
  pos: number,
  value: number,
  type: string
) {
  const offset = calcFastOffset(ptr, pos);
  const heapOffset = getHeapOffset(offset, type);
  const view = new DataView(memory.buffer);
  switch (type) {
    case "i1":
    case "i8":
      view.setUint8(heapOffset, value);
      break;
    case "u8":
      view.setUint8(heapOffset, value);
      break;
    case "i16":
      view.setInt16(heapOffset, value, true);
      break;
    case "u16":
      view.setUint16(heapOffset, value, true);
      break;
    case "i32":
      view.setInt32(heapOffset, value, true);
      break;
    case "u32":
      view.setUint32(heapOffset, value, true);
      break;
    case "f32":
      view.setFloat32(heapOffset, value, true);
      break;
    case "f64":
      view.setFloat64(heapOffset, value, true);
      break;
    default:
      throw new Error("invalid type");
  }
}

function getHeapOffset(offset: number, type: string) {
  const sz = getNativeTypeSize(type);
  if (sz == 1) {
    return offset;
  }
  if (MEMORY64) {
    return offset / sz;
  }
  const shifts = Math.log(sz) / Math.LN2;
  if (CAN_ADDRESS_2GB) {
    return offset >>> shifts;
  }
  return offset >> shifts;
}

function getNativeTypeSize(type: string) {
  // prettier-ignore
  switch (type) {
      case 'i1': case 'i8': case 'u8': return 1;
      case 'i16': case 'u16': return 2;
      case 'i32': case 'u32': return 4;
      case 'i64': case 'u64': return 8;
      case 'float': return 4;
      case 'double': return 8;
      default: {
        if (type[type.length - 1] === '*') {
          return POINTER_SIZE;
        }
        if (type[0] === 'i') {
          const bits = Number(type.substr(1));
          assert(bits % 8 === 0, `getNativeTypeSize invalid bits ${bits}, ${type} type`);
          return bits / 8;
        }
        return 0;
      }
    }
}

function calcFastOffset(ptr: number, pos: number) {
  return ptr + pos;
}

function assert(condition: boolean, text: string) {
  if (!condition) {
    throw new Error(text);
  }
}

// https://github.com/yamt/wasi-libc/blob/a0c169f4facefc1c0d99b000c756e24ef103c2db/libc-top-half/musl/src/setjmp/wasm32/rt.c
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
} {
  // struct entry {
  //   uint32_t id;
  //   uint32_t label;
  // };
  // static _Thread_local struct state {
  //   uint32_t id;
  //   uint32_t size;
  //   struct arg {
  //           void *env;
  //           int val;
  //   } arg;
  // } g_state;

  const gState = {
    id: 0,
    size: 0,
    arg: {
      env: 0,
      val: 0,
    },
  };

  // /*
  // * table is allocated at the entry of functions which call setjmp.
  // *
  // *   table = malloc(40);
  // *   size = 4;
  // *   *(int *)table = 0;
  // */
  // _Static_assert(sizeof(struct entry) * (4 + 1) <= 40, "entry size");
  // void *
  // saveSetjmp(void *env, uint32_t label, void *table, uint32_t size)
  // {
  //   struct state *state = &g_state;
  //   struct entry *e = table;
  //   uint32_t i;
  //   for (i = 0; i < size; i++) {
  //           if (e[i].id == 0) {
  //                   uint32_t id = ++state->id;
  //                   *(uint32_t *)env = id;
  //                   e[i].id = id;
  //                   e[i].label = label;
  //                   /*
  //                    * note: only the first word is zero-initialized
  //                    * by the caller.
  //                    */
  //                   e[i + 1].id = 0;
  //                   goto done;
  //           }
  //   }
  //   size *= 2;
  //   void *p = realloc(table, sizeof(*e) * (size + 1));
  //   if (p == NULL) {
  //           __builtin_trap();
  //   }
  //   table = p;
  // done:
  //   state->size = size;
  //   return table;
  // }

  function saveSetjmp(env: number, label: number, table: number, size: number) {
    const state = gState;
    const entry = new Uint32Array(memory.buffer, table, size * 2);
    for (let i = 0; i < size; i++) {
      if (entry[i * 2] == 0) {
        const id = ++state.id;
        new Uint32Array(memory.buffer, env, 1)[0] = id;
        entry[i * 2] = id;
        entry[i * 2 + 1] = label;
        entry[(i + 1) * 2] = 0;
        return table;
      }
    }
    size *= 2;
    const p = malloc(size * 2 * 4);
    if (p == 0) {
      throw new Error("realloc failed");
    }
    new Uint32Array(memory.buffer, p, size * 2).set(entry);
    free(table);
    return p;
  }

  // uint32_t
  // testSetjmp(unsigned int id, void *table, uint32_t size)
  // {
  //   struct entry *e = table;
  //   uint32_t i;
  //   for (i = 0; i < size; i++) {
  //           if (e[i].id == id) {
  //                   return e[i].label;
  //           }
  //   }
  //   return 0;
  // }

  function testSetjmp(id: number, table: number, size: number) {
    const entry = new Uint32Array(memory.buffer, table, size * 2);
    for (let i = 0; i < size; i++) {
      if (entry[i * 2] == id) {
        return entry[i * 2 + 1];
      }
    }
    return 0;
  }

  // uint32_t
  // getTempRet0()
  // {
  //   struct state *state = &g_state;
  //   return state->size;
  // }

  function getTempRet0() {
    return gState.size;
  }

  return { saveSetjmp, testSetjmp, getTempRet0 };
}

function implMath({
  memory,
  malloc,
}: {
  memory: WebAssembly.Memory;
  malloc: (size: number) => number;
}) {
  /* function types
    (type (;63;) (func (param i64 i64 i64 i64) (result i32)))
    (type (;64;) (func (param i32 i64 i64 i64 i64)))
    (type (;65;) (func (param i64 i64) (result i32)))
    (type (;6;) (func (param i32 i32)))
    (type (;66;) (func (param i32 f64)))
    (type (;18;) (func (param i32 f32)))
    (type (;67;) (func (param i64 i64) (result f32)))
    (type (;68;) (func (param i64 i64) (result f64)))
  */
  /* implements
    (import "env" "__eqtf2" (func $__eqtf2 (;148;) (type 63)))
    (import "env" "__unordtf2" (func $__unordtf2 (;149;) (type 63)))
    (import "env" "__addtf3" (func $__addtf3 (;150;) (type 64)))
    (import "env" "__multf3" (func $__multf3 (;151;) (type 64)))
    (import "env" "__fixunstfsi" (func $__fixunstfsi (;152;) (type 65)))
    (import "env" "__floatunsitf" (func $__floatunsitf (;153;) (type 6)))
    (import "env" "__subtf3" (func $__subtf3 (;154;) (type 64)))
    (import "env" "__netf2" (func $__netf2 (;155;) (type 63)))
    (import "env" "__fixtfsi" (func $__fixtfsi (;156;) (type 65)))
    (import "env" "__floatsitf" (func $__floatsitf (;157;) (type 6)))
    (import "env" "__extenddftf2" (func $__extenddftf2 (;158;) (type 66)))
    (import "env" "__extendsftf2" (func $__extendsftf2 (;159;) (type 18)))
    (import "env" "__divtf3" (func $__divtf3 (;160;) (type 64)))
    (import "env" "__getf2" (func $__getf2 (;161;) (type 63)))
    (import "env" "__trunctfsf2" (func $__trunctfsf2 (;162;) (type 67)))
    (import "env" "__trunctfdf2" (func $__trunctfdf2 (;163;) (type 68)))
    */

  const eqtf2 = (a: number, b: number): number => {
    const a1 = new Float64Array(memory.buffer, a, 1)[0];
    const b1 = new Float64Array(memory.buffer, b, 1)[0];
    return a1 === b1 ? 1 : 0;
  };

  const unordtf2 = (a: number, b: number): number => {
    const a1 = new Float64Array(memory.buffer, a, 1)[0];
    const b1 = new Float64Array(memory.buffer, b, 1)[0];
    return isNaN(a1) || isNaN(b1) ? 1 : 0;
  };

  const addtf3 = (a: number, b: number, c: number, d: number) => {
    const a1 = new Float64Array(memory.buffer, a, 1)[0];
    const b1 = new Float64Array(memory.buffer, b, 1)[0];
    const c1 = new Float64Array(memory.buffer, c, 1)[0];
    const d1 = new Float64Array(memory.buffer, d, 1)[0];
    const result = a1 + b1 + c1 + d1;
    return mallocFloat64(result);
  };

  const multf3 = (a: number, b: number, c: number, d: number) => {
    const a1 = new Float64Array(memory.buffer, a, 1)[0];
    const b1 = new Float64Array(memory.buffer, b, 1)[0];
    const c1 = new Float64Array(memory.buffer, c, 1)[0];
    const d1 = new Float64Array(memory.buffer, d, 1)[0];
    const result = a1 * b1 * c1 * d1;
    return mallocFloat64(result);
  };

  const fixunstfsi = (a: number, b: number) => {
    const a1 = new Float64Array(memory.buffer, a, 1)[0];
    return Math.floor(a1);
  };

  const floatunsitf = (a: number) => {
    const a1 = new Uint32Array(memory.buffer, a, 1)[0];
    return a1;
  };

  const subtf3 = (a: number, b: number, c: number, d: number) => {
    const a1 = new Float64Array(memory.buffer, a, 1)[0];
    const b1 = new Float64Array(memory.buffer, b, 1)[0];
    const c1 = new Float64Array(memory.buffer, c, 1)[0];
    const d1 = new Float64Array(memory.buffer, d, 1)[0];
    const result = a1 - b1 - c1 - d1;
    return mallocFloat64(result);
  };

  const netf2 = (a: number, b: number) => {
    const a1 = new Float64Array(memory.buffer, a, 1)[0];
    const b1 = new Float64Array(memory.buffer, b, 1)[0];
    return a1 !== b1 ? 1 : 0;
  };

  const fixtfsi = (a: number, b: number) => {
    const a1 = new Float64Array(memory.buffer, a, 1)[0];
    return Math.floor(a1);
  };

  const floatsitf = (a: number) => {
    const a1 = new Int32Array(memory.buffer, a, 1)[0];
    return a1;
  };

  const extenddftf2 = (a: number) => {
    const a1 = new Float64Array(memory.buffer, a, 1)[0];
    return mallocFloat64(a1);
  };

  const extendsftf2 = (a: number) => {
    const a1 = new Float32Array(memory.buffer, a, 1)[0];
    return mallocFloat32(a1);
  };

  const divtf3 = (a: number, b: number, c: number, d: number) => {
    const a1 = new Float64Array(memory.buffer, a, 1)[0];
    const b1 = new Float64Array(memory.buffer, b, 1)[0];
    const c1 = new Float64Array(memory.buffer, c, 1)[0];
    const d1 = new Float64Array(memory.buffer, d, 1)[0];
    const result = a1 / b1 / c1 / d1;
    return mallocFloat64(result);
  };

  const getf2 = (a: number, b: number) => {
    const a1 = new Float64Array(memory.buffer, a, 1)[0];
    const b1 = new Float64Array(memory.buffer, b, 1)[0];
    return a1 > b1 ? 1 : 0;
  };

  const trunctfsf2 = (a: number, b: number) => {
    const a1 = new Float64Array(memory.buffer, a, 1)[0];
    return mallocFloat32(a1);
  };

  const trunctfdf2 = (a: number, b: number) => {
    const a1 = new Float64Array(memory.buffer, a, 1)[0];
    return mallocFloat64(a1);
  };

  function mallocFloat64(value: number) {
    const ptr = malloc(8);
    new Float64Array(memory.buffer, ptr, 1)[0] = value;
    return ptr;
  }

  function mallocFloat32(value: number) {
    const ptr = malloc(4);
    new Float32Array(memory.buffer, ptr, 1)[0] = value;
    return ptr;
  }

  // (import "env" "__letf2" (func $__letf2 (;174;) (type 63)))

  const letf2 = (a: number, b: number): number => {
    const a1 = new Float64Array(memory.buffer, a, 1)[0];
    const b1 = new Float64Array(memory.buffer, b, 1)[0];
    return a1 < b1 ? 1 : 0;
  };

  return {
    __eqtf2: eqtf2,
    __unordtf2: unordtf2,
    __addtf3: addtf3,
    __multf3: multf3,
    __fixunstfsi: fixunstfsi,
    __floatunsitf: floatunsitf,
    __subtf3: subtf3,
    __netf2: netf2,
    __fixtfsi: fixtfsi,
    __floatsitf: floatsitf,
    __extenddftf2: extenddftf2,
    __extendsftf2: extendsftf2,
    __divtf3: divtf3,
    __getf2: getf2,
    __trunctfsf2: trunctfsf2,
    __trunctfdf2: trunctfdf2,
    __letf2: letf2,
  };
}
