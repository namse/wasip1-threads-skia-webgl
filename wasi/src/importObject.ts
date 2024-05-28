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
  memory,
  module,
  nextTid,
  wasiImport,
  malloc,
  free,
  webgl,
}: {
  memory: WebAssembly.Memory;
  module: WebAssembly.Module;
  nextTid: SharedArrayBuffer;
  wasiImport: Record<string, any>;
  malloc: (size: number) => number;
  free: (ptr: number) => void;
  webgl?: WebGL2RenderingContext;
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
    env: {
      memory,
      ...envGl({
        malloc,
        free,
      }),
      glGetStringi: () => {
        throw new Error("glGetStringi is not implemented");
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

              makeSetValue(params, 0, 0, "i32");
              return;
            }
            break;
          }
        }
      },
      glGetString: (name: number) => {
        // print name in hex
        console.log("glGetString", name.toString(16));
        if (!webgl) {
          throw new Error("webgl is not set");
        }
        //   console.log("glGetString", name);
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
            const s = webgl.getParameter(name);
            ret = s ? stringToNewUTF8(s) : 0;

            if (!s) {
              // This occurs e.g. if one attempts GL_UNMASKED_VENDOR_WEBGL when it is not supported.
              throw new Error(
                `GL_INVALID_ENUM in glGetString: Received empty parameter for query name ${name}!`
              );
            }

            break;
          case 0x1f02 /* GL_VERSION */:
            let glVersion = webgl.getParameter(0x1f02 /*GL_VERSION*/);
            // return GLES version string corresponding to the version of the WebGL context
            glVersion = `OpenGL ES 3.0 (${glVersion})`;
            console.log("glVersion", glVersion);
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
    },
    wasi_snapshot_preview1: wasiImport,
    wasi: {
      "thread-spawn": (start_arg_ptr: number) => {
        const tid = Atomics.add(new Uint32Array(nextTid), 0, 1);
        self.postMessage({
          tid,
          nextTid,
          memory,
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
}: {
  malloc: (size: number) => number;
  free: (ptr: number) => void;
}) {
  return {
    //   (import "env" "_ZdlPv" (func $_ZdlPv (;7;) (type 3)))
    _ZdlPv: (ptr: number) => {
      free(ptr);
    },
    //   (import "env" "_Znwm" (func $_Znwm (;8;) (type 4)))
    _Znwm: (n: number) => {
      return malloc(n);
    },
    //   (import "env" "glUniform1fv" (func $glUniform1fv (;9;) (type 6)))
    glUniform1fv: () => {
      throw new Error("glUniform1fv is not implemented");
    },
    //   (import "env" "glUniform1f" (func $glUniform1f (;10;) (type 7)))
    glUniform1f: () => {
      throw new Error("glUniform1f is not implemented");
    },
    //   (import "env" "glTexSubImage2D" (func $glTexSubImage2D (;11;) (type 8)))
    glTexSubImage2D: () => {
      throw new Error("glTexSubImage2D is not implemented");
    },
    //   (import "env" "glTexParameteriv" (func $glTexParameteriv (;12;) (type 6)))
    glTexParameteriv: () => {
      throw new Error("glTexParameteriv is not implemented");
    },
    //   (import "env" "glTexParameteri" (func $glTexParameteri (;13;) (type 6)))
    glTexParameteri: () => {
      throw new Error("glTexParameteri is not implemented");
    },
    //   (import "env" "glTexParameterfv" (func $glTexParameterfv (;14;) (type 6)))
    glTexParameterfv: () => {
      throw new Error("glTexParameterfv is not implemented");
    },
    //   (import "env" "glTexParameterf" (func $glTexParameterf (;15;) (type 9)))
    glTexParameterf: () => {
      throw new Error("glTexParameterf is not implemented");
    },
    //   (import "env" "glTexImage2D" (func $glTexImage2D (;16;) (type 8)))
    glTexImage2D: () => {
      throw new Error("glTexImage2D is not implemented");
    },
    //   (import "env" "glStencilOpSeparate" (func $glStencilOpSeparate (;17;) (type 10)))
    glStencilOpSeparate: () => {
      throw new Error("glStencilOpSeparate is not implemented");
    },
    //   (import "env" "glStencilOp" (func $glStencilOp (;18;) (type 6)))
    glStencilOp: () => {
      throw new Error("glStencilOp is not implemented");
    },
    //   (import "env" "glStencilMaskSeparate" (func $glStencilMaskSeparate (;19;) (type 5)))
    glStencilMaskSeparate: () => {
      throw new Error("glStencilMaskSeparate is not implemented");
    },
    //   (import "env" "glStencilMask" (func $glStencilMask (;20;) (type 3)))
    glStencilMask: () => {
      throw new Error("glStencilMask is not implemented");
    },
    //   (import "env" "glStencilFuncSeparate" (func $glStencilFuncSeparate (;21;) (type 10)))
    glStencilFuncSeparate: () => {
      throw new Error("glStencilFuncSeparate is not implemented");
    },
    //   (import "env" "glStencilFunc" (func $glStencilFunc (;22;) (type 6)))
    glStencilFunc: () => {
      throw new Error("glStencilFunc is not implemented");
    },
    //   (import "env" "glShaderSource" (func $glShaderSource (;23;) (type 10)))
    glShaderSource: () => {
      throw new Error("glShaderSource is not implemented");
    },
    //   (import "env" "glScissor" (func $glScissor (;24;) (type 10)))
    glScissor: () => {
      throw new Error("glScissor is not implemented");
    },
    //   (import "env" "glReadPixels" (func $glReadPixels (;25;) (type 11)))
    glReadPixels: () => {
      throw new Error("glReadPixels is not implemented");
    },
    //   (import "env" "glPixelStorei" (func $glPixelStorei (;26;) (type 5)))
    glPixelStorei: () => {
      throw new Error("glPixelStorei is not implemented");
    },
    //   (import "env" "glLinkProgram" (func $glLinkProgram (;27;) (type 3)))
    glLinkProgram: () => {
      throw new Error("glLinkProgram is not implemented");
    },
    //   (import "env" "glLineWidth" (func $glLineWidth (;28;) (type 12)))
    glLineWidth: () => {
      throw new Error("glLineWidth is not implemented");
    },
    //   (import "env" "glIsTexture" (func $glIsTexture (;29;) (type 4)))
    glIsTexture: () => {
      throw new Error("glIsTexture is not implemented");
    },
    //   (import "env" "glGetUniformLocation" (func $glGetUniformLocation (;30;) (type 1)))
    glGetUniformLocation: () => {
      throw new Error("glGetUniformLocation is not implemented");
    },
    //   (import "env" "glGetShaderiv" (func $glGetShaderiv (;31;) (type 6)))
    glGetShaderiv: () => {
      throw new Error("glGetShaderiv is not implemented");
    },
    //   (import "env" "glGetShaderInfoLog" (func $glGetShaderInfoLog (;32;) (type 10)))
    glGetShaderInfoLog: () => {
      throw new Error("glGetShaderInfoLog is not implemented");
    },
    //   (import "env" "glGetProgramiv" (func $glGetProgramiv (;33;) (type 6)))
    glGetProgramiv: () => {
      throw new Error("glGetProgramiv is not implemented");
    },
    //   (import "env" "glGetProgramInfoLog" (func $glGetProgramInfoLog (;34;) (type 10)))
    glGetProgramInfoLog: () => {
      throw new Error("glGetProgramInfoLog is not implemented");
    },
    //   (import "env" "glGetFloatv" (func $glGetFloatv (;35;) (type 5)))
    glGetFloatv: () => {
      throw new Error("glGetFloatv is not implemented");
    },
    //   (import "env" "glGetError" (func $glGetError (;36;) (type 13)))
    glGetError: () => {
      throw new Error("glGetError is not implemented");
    },
    //   (import "env" "glGetBufferParameteriv" (func $glGetBufferParameteriv (;37;) (type 6)))
    glGetBufferParameteriv: () => {
      throw new Error("glGetBufferParameteriv is not implemented");
    },
    //   (import "env" "glGenTextures" (func $glGenTextures (;38;) (type 5)))
    glGenTextures: () => {
      throw new Error("glGenTextures is not implemented");
    },
    //   (import "env" "glGenBuffers" (func $glGenBuffers (;39;) (type 5)))
    glGenBuffers: () => {
      throw new Error("glGenBuffers is not implemented");
    },
    //   (import "env" "glFrontFace" (func $glFrontFace (;40;) (type 3)))
    glFrontFace: () => {
      throw new Error("glFrontFace is not implemented");
    },
    //   (import "env" "glFlush" (func $glFlush (;41;) (type 2)))
    glFlush: () => {
      throw new Error("glFlush is not implemented");
    },
    //   (import "env" "glFinish" (func $glFinish (;42;) (type 2)))
    glFinish: () => {
      throw new Error("glFinish is not implemented");
    },
    //   (import "env" "glEnableVertexAttribArray" (func $glEnableVertexAttribArray (;43;) (type 3)))
    glEnableVertexAttribArray: () => {
      throw new Error("glEnableVertexAttribArray is not implemented");
    },
    //   (import "env" "glEnable" (func $glEnable (;44;) (type 3)))
    glEnable: () => {
      throw new Error("glEnable is not implemented");
    },
    //   (import "env" "glDrawElements" (func $glDrawElements (;45;) (type 10)))
    glDrawElements: () => {
      throw new Error("glDrawElements is not implemented");
    },
    //   (import "env" "glDrawArrays" (func $glDrawArrays (;46;) (type 6)))
    glDrawArrays: () => {
      throw new Error("glDrawArrays is not implemented");
    },
    //   (import "env" "glDisableVertexAttribArray" (func $glDisableVertexAttribArray (;47;) (type 3)))
    glDisableVertexAttribArray: () => {
      throw new Error("glDisableVertexAttribArray is not implemented");
    },
    //   (import "env" "glDisable" (func $glDisable (;48;) (type 3)))
    glDisable: () => {
      throw new Error("glDisable is not implemented");
    },
    //   (import "env" "glDepthMask" (func $glDepthMask (;49;) (type 3)))
    glDepthMask: () => {
      throw new Error("glDepthMask is not implemented");
    },
    //   (import "env" "glDeleteTextures" (func $glDeleteTextures (;50;) (type 5)))
    glDeleteTextures: () => {
      throw new Error("glDeleteTextures is not implemented");
    },
    //   (import "env" "glDeleteShader" (func $glDeleteShader (;51;) (type 3)))
    glDeleteShader: () => {
      throw new Error("glDeleteShader is not implemented");
    },
    //   (import "env" "glDeleteProgram" (func $glDeleteProgram (;52;) (type 3)))
    glDeleteProgram: () => {
      throw new Error("glDeleteProgram is not implemented");
    },
    //   (import "env" "glDeleteBuffers" (func $glDeleteBuffers (;53;) (type 5)))
    glDeleteBuffers: () => {
      throw new Error("glDeleteBuffers is not implemented");
    },
    //   (import "env" "glCullFace" (func $glCullFace (;54;) (type 3)))
    glCullFace: () => {
      throw new Error("glCullFace is not implemented");
    },
    //   (import "env" "glCreateShader" (func $glCreateShader (;55;) (type 4)))
    glCreateShader: () => {
      throw new Error("glCreateShader is not implemented");
    },
    //   (import "env" "glCreateProgram" (func $glCreateProgram (;56;) (type 13)))
    glCreateProgram: () => {
      throw new Error("glCreateProgram is not implemented");
    },
    //   (import "env" "glCopyTexSubImage2D" (func $glCopyTexSubImage2D (;57;) (type 14)))
    glCopyTexSubImage2D: () => {
      throw new Error("glCopyTexSubImage2D is not implemented");
    },
    //   (import "env" "glCompressedTexSubImage2D" (func $glCompressedTexSubImage2D (;58;) (type 8)))
    glCompressedTexSubImage2D: () => {
      throw new Error("glCompressedTexSubImage2D is not implemented");
    },
    //   (import "env" "glCompressedTexImage2D" (func $glCompressedTexImage2D (;59;) (type 14)))
    glCompressedTexImage2D: () => {
      throw new Error("glCompressedTexImage2D is not implemented");
    },
    //   (import "env" "glCompileShader" (func $glCompileShader (;60;) (type 3)))
    glCompileShader: () => {
      throw new Error("glCompileShader is not implemented");
    },
    //   (import "env" "glColorMask" (func $glColorMask (;61;) (type 10)))
    glColorMask: () => {
      throw new Error("glColorMask is not implemented");
    },
    //   (import "env" "glClearStencil" (func $glClearStencil (;62;) (type 3)))
    glClearStencil: () => {
      throw new Error("glClearStencil is not implemented");
    },
    //   (import "env" "glClearColor" (func $glClearColor (;63;) (type 15)))
    glClearColor: () => {
      throw new Error("glClearColor is not implemented");
    },
    //   (import "env" "glClear" (func $glClear (;64;) (type 3)))
    glClear: () => {
      throw new Error("glClear is not implemented");
    },
    //   (import "env" "glBufferSubData" (func $glBufferSubData (;65;) (type 10)))
    glBufferSubData: () => {
      throw new Error("glBufferSubData is not implemented");
    },
    //   (import "env" "glBufferData" (func $glBufferData (;66;) (type 10)))
    glBufferData: () => {
      throw new Error("glBufferData is not implemented");
    },
    //   (import "env" "glBlendFunc" (func $glBlendFunc (;67;) (type 5)))
    glBlendFunc: () => {
      throw new Error("glBlendFunc is not implemented");
    },
    //   (import "env" "glBlendEquation" (func $glBlendEquation (;68;) (type 3)))
    glBlendEquation: () => {
      throw new Error("glBlendEquation is not implemented");
    },
    //   (import "env" "glBlendColor" (func $glBlendColor (;69;) (type 15)))
    glBlendColor: () => {
      throw new Error("glBlendColor is not implemented");
    },
    //   (import "env" "glBindTexture" (func $glBindTexture (;70;) (type 5)))
    glBindTexture: () => {
      throw new Error("glBindTexture is not implemented");
    },
    //   (import "env" "glBindBuffer" (func $glBindBuffer (;71;) (type 5)))
    glBindBuffer: () => {
      throw new Error("glBindBuffer is not implemented");
    },
    //   (import "env" "glBindAttribLocation" (func $glBindAttribLocation (;72;) (type 6)))
    glBindAttribLocation: () => {
      throw new Error("glBindAttribLocation is not implemented");
    },
    //   (import "env" "glAttachShader" (func $glAttachShader (;73;) (type 5)))
    glAttachShader: () => {
      throw new Error("glAttachShader is not implemented");
    },
    //   (import "env" "glActiveTexture" (func $glActiveTexture (;74;) (type 3)))
    glActiveTexture: () => {
      throw new Error("glActiveTexture is not implemented");
    },
    //   (import "env" "glUniform2fv" (func $glUniform2fv (;75;) (type 6)))
    glUniform2fv: () => {
      throw new Error("glUniform2fv is not implemented");
    },
    //   (import "env" "glUniform2f" (func $glUniform2f (;76;) (type 16)))
    glUniform2f: () => {
      throw new Error("glUniform2f is not implemented");
    },
    //   (import "env" "glUniform1iv" (func $glUniform1iv (;77;) (type 6)))
    glUniform1iv: () => {
      throw new Error("glUniform1iv is not implemented");
    },
    //   (import "env" "glUniform1i" (func $glUniform1i (;78;) (type 5)))
    glUniform1i: () => {
      throw new Error("glUniform1i is not implemented");
    },
    //   (import "env" "glUniform2i" (func $glUniform2i (;79;) (type 6)))
    glUniform2i: () => {
      throw new Error("glUniform2i is not implemented");
    },
    //   (import "env" "glUniform2iv" (func $glUniform2iv (;80;) (type 6)))
    glUniform2iv: () => {
      throw new Error("glUniform2iv is not implemented");
    },
    //   (import "env" "glUniform3f" (func $glUniform3f (;81;) (type 17)))
    glUniform3f: () => {
      throw new Error("glUniform3f is not implemented");
    },
    //   (import "env" "glUniform3fv" (func $glUniform3fv (;82;) (type 6)))
    glUniform3fv: () => {
      throw new Error("glUniform3fv is not implemented");
    },
    //   (import "env" "glUniform3i" (func $glUniform3i (;83;) (type 10)))
    glUniform3i: () => {
      throw new Error("glUniform3i is not implemented");
    },
    //   (import "env" "glUniform3iv" (func $glUniform3iv (;84;) (type 6)))
    glUniform3iv: () => {
      throw new Error("glUniform3iv is not implemented");
    },
    //   (import "env" "glUniform4f" (func $glUniform4f (;85;) (type 18)))
    glUniform4f: () => {
      throw new Error("glUniform4f is not implemented");
    },
    //   (import "env" "glUniform4fv" (func $glUniform4fv (;86;) (type 6)))
    glUniform4fv: () => {
      throw new Error("glUniform4fv is not implemented");
    },
    //   (import "env" "glViewport" (func $glViewport (;87;) (type 10)))
    glViewport: () => {
      throw new Error("glViewport is not implemented");
    },
    //   (import "env" "glVertexAttribPointer" (func $glVertexAttribPointer (;88;) (type 19)))
    glVertexAttribPointer: () => {
      throw new Error("glVertexAttribPointer is not implemented");
    },
    //   (import "env" "glVertexAttrib4fv" (func $glVertexAttrib4fv (;89;) (type 5)))
    glVertexAttrib4fv: () => {
      throw new Error("glVertexAttrib4fv is not implemented");
    },
    //   (import "env" "glVertexAttrib3fv" (func $glVertexAttrib3fv (;90;) (type 5)))
    glVertexAttrib3fv: () => {
      throw new Error("glVertexAttrib3fv is not implemented");
    },
    //   (import "env" "glVertexAttrib2fv" (func $glVertexAttrib2fv (;91;) (type 5)))
    glVertexAttrib2fv: () => {
      throw new Error("glVertexAttrib2fv is not implemented");
    },
    //   (import "env" "glVertexAttrib1f" (func $glVertexAttrib1f (;92;) (type 7)))
    glVertexAttrib1f: () => {
      throw new Error("glVertexAttrib1f is not implemented");
    },
    //   (import "env" "glUseProgram" (func $glUseProgram (;93;) (type 3)))
    glUseProgram: () => {
      throw new Error("glUseProgram is not implemented");
    },
    //   (import "env" "glUniformMatrix4fv" (func $glUniformMatrix4fv (;94;) (type 10)))
    glUniformMatrix4fv: () => {
      throw new Error("glUniformMatrix4fv is not implemented");
    },
    //   (import "env" "glUniformMatrix3fv" (func $glUniformMatrix3fv (;95;) (type 10)))
    glUniformMatrix3fv: () => {
      throw new Error("glUniformMatrix3fv is not implemented");
    },
    //   (import "env" "glUniformMatrix2fv" (func $glUniformMatrix2fv (;96;) (type 10)))
    glUniformMatrix2fv: () => {
      throw new Error("glUniformMatrix2fv is not implemented");
    },
    //   (import "env" "glUniform4iv" (func $glUniform4iv (;97;) (type 6)))
    glUniform4iv: () => {
      throw new Error("glUniform4iv is not implemented");
    },
    //   (import "env" "glUniform4i" (func $glUniform4i (;98;) (type 20)))
    glUniform4i: () => {
      throw new Error("glUniform4i is not implemented");
    },
    //   (import "env" "glGenVertexArraysOES" (func $glGenVertexArraysOES (;99;) (type 5)))
    glGenVertexArraysOES: () => {
      throw new Error("glGenVertexArraysOES is not implemented");
    },
    //   (import "env" "glDeleteVertexArraysOES" (func $glDeleteVertexArraysOES (;100;) (type 5)))
    glDeleteVertexArraysOES: () => {
      throw new Error("glDeleteVertexArraysOES is not implemented");
    },
    //   (import "env" "glBindVertexArrayOES" (func $glBindVertexArrayOES (;101;) (type 3)))
    glBindVertexArrayOES: () => {
      throw new Error("glBindVertexArrayOES is not implemented");
    },
    //   (import "env" "glGenVertexArrays" (func $glGenVertexArrays (;102;) (type 5)))
    glGenVertexArrays: () => {
      throw new Error("glGenVertexArrays is not implemented");
    },
    //   (import "env" "glDeleteVertexArrays" (func $glDeleteVertexArrays (;103;) (type 5)))
    glDeleteVertexArrays: () => {
      throw new Error("glDeleteVertexArrays is not implemented");
    },
    //   (import "env" "glBindVertexArray" (func $glBindVertexArray (;104;) (type 3)))
    glBindVertexArray: () => {
      throw new Error("glBindVertexArray is not implemented");
    },
    //   (import "env" "glDrawElementsInstanced" (func $glDrawElementsInstanced (;105;) (type 20)))
    glDrawElementsInstanced: () => {
      throw new Error("glDrawElementsInstanced is not implemented");
    },
    //   (import "env" "glDrawArraysInstanced" (func $glDrawArraysInstanced (;106;) (type 10)))
    glDrawArraysInstanced: () => {
      throw new Error("glDrawArraysInstanced is not implemented");
    },
    //   (import "env" "glDrawElementsInstancedBaseVertexBaseInstanceWEBGL" (func $glDrawElementsInstancedBaseVertexBaseInstanceWEBGL (;107;) (type 11)))
    glDrawElementsInstancedBaseVertexBaseInstanceWEBGL: () => {
      throw new Error(
        "glDrawElementsInstancedBaseVertexBaseInstanceWEBGL is not implemented"
      );
    },
    //   (import "env" "glDrawArraysInstancedBaseInstanceWEBGL" (func $glDrawArraysInstancedBaseInstanceWEBGL (;108;) (type 20)))
    glDrawArraysInstancedBaseInstanceWEBGL: () => {
      throw new Error(
        "glDrawArraysInstancedBaseInstanceWEBGL is not implemented"
      );
    },
    //   (import "env" "glReadBuffer" (func $glReadBuffer (;109;) (type 3)))
    glReadBuffer: () => {
      throw new Error("glReadBuffer is not implemented");
    },
    //   (import "env" "glDrawBuffers" (func $glDrawBuffers (;110;) (type 5)))
    glDrawBuffers: () => {
      throw new Error("glDrawBuffers is not implemented");
    },
    //   (import "env" "glMultiDrawElementsInstancedBaseVertexBaseInstanceWEBGL" (func $glMultiDrawElementsInstancedBaseVertexBaseInstanceWEBGL (;111;) (type 14)))
    glMultiDrawElementsInstancedBaseVertexBaseInstanceWEBGL: () => {
      throw new Error(
        "glMultiDrawElementsInstancedBaseVertexBaseInstanceWEBGL is not implemented"
      );
    },
    //   (import "env" "glMultiDrawArraysInstancedBaseInstanceWEBGL" (func $glMultiDrawArraysInstancedBaseInstanceWEBGL (;112;) (type 19)))
    glMultiDrawArraysInstancedBaseInstanceWEBGL: () => {
      throw new Error(
        "glMultiDrawArraysInstancedBaseInstanceWEBGL is not implemented"
      );
    },
    //   (import "env" "glVertexAttribIPointer" (func $glVertexAttribIPointer (;113;) (type 20)))
    glVertexAttribIPointer: () => {
      throw new Error("glVertexAttribIPointer is not implemented");
    },
    //   (import "env" "glVertexAttribDivisor" (func $glVertexAttribDivisor (;114;) (type 5)))
    glVertexAttribDivisor: () => {
      throw new Error("glVertexAttribDivisor is not implemented");
    },
    //   (import "env" "glTexStorage2D" (func $glTexStorage2D (;115;) (type 20)))
    glTexStorage2D: () => {
      throw new Error("glTexStorage2D is not implemented");
    },
    //   (import "env" "glDrawRangeElements" (func $glDrawRangeElements (;116;) (type 19)))
    glDrawRangeElements: () => {
      throw new Error("glDrawRangeElements is not implemented");
    },
    //   (import "env" "glGenRenderbuffers" (func $glGenRenderbuffers (;117;) (type 5)))
    glGenRenderbuffers: () => {
      throw new Error("glGenRenderbuffers is not implemented");
    },
    //   (import "env" "glGenFramebuffers" (func $glGenFramebuffers (;118;) (type 5)))
    glGenFramebuffers: () => {
      throw new Error("glGenFramebuffers is not implemented");
    },
    //   (import "env" "glFramebufferTexture2D" (func $glFramebufferTexture2D (;119;) (type 20)))
    glFramebufferTexture2D: () => {
      throw new Error("glFramebufferTexture2D is not implemented");
    },
    //   (import "env" "glFramebufferRenderbuffer" (func $glFramebufferRenderbuffer (;120;) (type 10)))
    glFramebufferRenderbuffer: () => {
      throw new Error("glFramebufferRenderbuffer is not implemented");
    },
    //   (import "env" "glDeleteRenderbuffers" (func $glDeleteRenderbuffers (;121;) (type 5)))
    glDeleteRenderbuffers: () => {
      throw new Error("glDeleteRenderbuffers is not implemented");
    },
    //   (import "env" "glDeleteFramebuffers" (func $glDeleteFramebuffers (;122;) (type 5)))
    glDeleteFramebuffers: () => {
      throw new Error("glDeleteFramebuffers is not implemented");
    },
    //   (import "env" "glCheckFramebufferStatus" (func $glCheckFramebufferStatus (;123;) (type 4)))
    glCheckFramebufferStatus: () => {
      throw new Error("glCheckFramebufferStatus is not implemented");
    },
    //   (import "env" "glBindRenderbuffer" (func $glBindRenderbuffer (;124;) (type 5)))
    glBindRenderbuffer: () => {
      throw new Error("glBindRenderbuffer is not implemented");
    },
    //   (import "env" "glBindFramebuffer" (func $glBindFramebuffer (;125;) (type 5)))
    glBindFramebuffer: () => {
      throw new Error("glBindFramebuffer is not implemented");
    },
    //   (import "env" "glRenderbufferStorage" (func $glRenderbufferStorage (;126;) (type 10)))
    glRenderbufferStorage: () => {
      throw new Error("glRenderbufferStorage is not implemented");
    },
    //   (import "env" "glGetRenderbufferParameteriv" (func $glGetRenderbufferParameteriv (;127;) (type 6)))
    glGetRenderbufferParameteriv: () => {
      throw new Error("glGetRenderbufferParameteriv is not implemented");
    },
    //   (import "env" "glGetFramebufferAttachmentParameteriv" (func $glGetFramebufferAttachmentParameteriv (;128;) (type 10)))
    glGetFramebufferAttachmentParameteriv: () => {
      throw new Error(
        "glGetFramebufferAttachmentParameteriv is not implemented"
      );
    },
    //   (import "env" "glGenerateMipmap" (func $glGenerateMipmap (;129;) (type 3)))
    glGenerateMipmap: () => {
      throw new Error("glGenerateMipmap is not implemented");
    },
    //   (import "env" "glRenderbufferStorageMultisample" (func $glRenderbufferStorageMultisample (;130;) (type 20)))
    glRenderbufferStorageMultisample: () => {
      throw new Error("glRenderbufferStorageMultisample is not implemented");
    },
    //   (import "env" "glBlitFramebuffer" (func $glBlitFramebuffer (;131;) (type 21)))
    glBlitFramebuffer: () => {
      throw new Error("glBlitFramebuffer is not implemented");
    },
    //   (import "env" "glDeleteSync" (func $glDeleteSync (;132;) (type 3)))
    glDeleteSync: () => {
      throw new Error("glDeleteSync is not implemented");
    },
    //   (import "env" "glClientWaitSync" (func $glClientWaitSync (;133;) (type 22)))
    glClientWaitSync: () => {
      throw new Error("glClientWaitSync is not implemented");
    },
    //   (import "env" "glCopyBufferSubData" (func $glCopyBufferSubData (;134;) (type 20)))
    glCopyBufferSubData: () => {
      throw new Error("glCopyBufferSubData is not implemented");
    },
    //   (import "env" "glWaitSync" (func $glWaitSync (;135;) (type 23)))
    glWaitSync: () => {
      throw new Error("glWaitSync is not implemented");
    },
    //   (import "env" "glIsSync" (func $glIsSync (;136;) (type 4)))
    glIsSync: () => {
      throw new Error("glIsSync is not implemented");
    },
    //   (import "env" "glFenceSync" (func $glFenceSync (;137;) (type 1)))
    glFenceSync: () => {
      throw new Error("glFenceSync is not implemented");
    },
    //   (import "env" "glSamplerParameteriv" (func $glSamplerParameteriv (;138;) (type 6)))
    glSamplerParameteriv: () => {
      throw new Error("glSamplerParameteriv is not implemented");
    },
    //   (import "env" "glSamplerParameteri" (func $glSamplerParameteri (;139;) (type 6)))
    glSamplerParameteri: () => {
      throw new Error("glSamplerParameteri is not implemented");
    },
    //   (import "env" "glSamplerParameterf" (func $glSamplerParameterf (;140;) (type 9)))
    glSamplerParameterf: () => {
      throw new Error("glSamplerParameterf is not implemented");
    },
    //   (import "env" "glGenSamplers" (func $glGenSamplers (;141;) (type 5)))
    glGenSamplers: () => {
      throw new Error("glGenSamplers is not implemented");
    },
    //   (import "env" "glDeleteSamplers" (func $glDeleteSamplers (;142;) (type 5)))
    glDeleteSamplers: () => {
      throw new Error("glDeleteSamplers is not implemented");
    },
    //   (import "env" "glBindSampler" (func $glBindSampler (;143;) (type 5)))
    glBindSampler: () => {
      throw new Error("glBindSampler is not implemented");
    },
    //   (import "env" "glInvalidateSubFramebuffer" (func $glInvalidateSubFramebuffer (;144;) (type 11)))
    glInvalidateSubFramebuffer: () => {
      throw new Error("glInvalidateSubFramebuffer is not implemented");
    },
    //   (import "env" "glInvalidateFramebuffer" (func $glInvalidateFramebuffer (;145;) (type 6)))
    glInvalidateFramebuffer: () => {
      throw new Error("glInvalidateFramebuffer is not implemented");
    },
    //   (import "env" "glGetShaderPrecisionFormat" (func $glGetShaderPrecisionFormat (;146;) (type 10)))
    glGetShaderPrecisionFormat: () => {
      throw new Error("glGetShaderPrecisionFormat is not implemented");
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
 * @return {string} JS code for performing the memory set operation
 */
function makeSetValue(ptr: number, pos: number, value: number, type: string) {
  var rtn = makeSetValueImpl(ptr, pos, value, type);
  if (ASSERTIONS == 2 && (type.startsWith("i") || type.startsWith("u"))) {
    const width = getBitWidth(type);
    const assertion = `checkInt${width}(${value})`;
    rtn += `;${assertion}`;
  }
  return rtn;
}
function getBitWidth(type: string) {
  if (type == "i53" || type == "u53") return 53;
  return getNativeTypeSize(type) * 8;
}

function makeSetValueImpl(
  ptr: number,
  pos: number,
  value: number,
  type: string
): string {
  // if (type == "i64" && !WASM_BIGINT) {
  //   // If we lack BigInt support we must fall back to an reading a pair of I32
  //   // values.
  //   // prettier-ignore
  //   return '(tempI64 = [' + splitI64(value) + '], ' +
  //           makeSetValueImpl(ptr, pos, 'tempI64[0]', 'i32') + ',' +
  //           makeSetValueImpl(ptr, getFastValue(pos, '+', getNativeTypeSize('i32')), 'tempI64[1]', 'i32') + ')';
  // }

  const offset = calcFastOffset(ptr, pos);

  if (type === "i53") {
    return `writeI53ToI64(${offset}, ${value})`;
  }

  const slab = getHeapForType(type);
  let value2: number | string = value;
  if (slab == "HEAPU64" || slab == "HEAP64") {
    value2 = `BigInt(${value})`;
  }
  return `${slab}[${getHeapOffset(offset, type)}] = ${value2}`;
}

function getHeapOffset(offset: number, type: string) {
  const sz = getNativeTypeSize(type);
  if (sz == 1) {
    return offset;
  }
  if (MEMORY64) {
    return `((${offset})/${sz})`;
  }
  const shifts = Math.log(sz) / Math.LN2;
  if (CAN_ADDRESS_2GB) {
    return `((${offset})>>>${shifts})`;
  }
  return `((${offset})>>${shifts})`;
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

function isPointerType(type: string) {
  return type[type.length - 1] == "*";
}

function getHeapForType(type: string) {
  if (isPointerType(type)) {
    type = POINTER_TYPE;
  }
  if (WASM_BIGINT) {
    switch (type) {
      case "i64":
        return "HEAP64";
      case "u64":
        return "HEAPU64";
    }
  }
  // prettier-ignore
  switch (type) {
    case 'i1':     // fallthrough
    case 'i8':     return 'HEAP8';
    case 'u8':     return 'HEAPU8';
    case 'i16':    return 'HEAP16';
    case 'u16':    return 'HEAPU16';
    case 'i32':    return 'HEAP32';
    case 'u32':    return 'HEAPU32';
    case 'double': return 'HEAPF64';
    case 'float':  return 'HEAPF32';
    case 'i64':    // fallthrough
    case 'u64':    throw new Error('use i53/u53, or avoid i64/u64 without WASM_BIGINT');
  }
  assert(false, `bad heap type: ${type}`);
}

function assert(condition: boolean, text: string) {
  if (!condition) {
    throw new Error(text);
  }
}
