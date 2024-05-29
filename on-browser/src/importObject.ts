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
  const glFunctions = envGl({
    malloc,
    webgl,
    memory,
  }) as any;

  for (const key in glFunctions) {
    const original = glFunctions[key];
    glFunctions[key] = (...args: (number | bigint)[]) => {
      console.debug(key, args.map((x) => x.toString(16)).join(","));
      return original(...args);
    };
  }

  return {
    env: {
      memory: importMemory,
      ...glFunctions,
      ...implSetJmp({
        memory,
        malloc,
        free,
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
  webgl,
  memory,
}: {
  malloc: (size: number) => number;
  webgl: WebGL2RenderingContext | undefined;
  memory: WebAssembly.Memory;
}) {
  const stringCache = new Map<number, number>();

  const webglBufferMap = new Map<number, WebGLBuffer>();
  let nextBufferId = 1;

  type ProgramInfo = {
    program: WebGLProgram;
    nameToUniformLocation: Map<string, WebGLUniformLocation>;
    uniformLocationNameToId: Map<string, number>;
    idToUniformLocation: Map<number, WebGLUniformLocation>;
  };
  const programInfos = new Map<number, ProgramInfo>();
  let nextProgramId = 1;

  const webglShaderMap = new Map<number, WebGLShader>();
  let nextShaderId = 1;

  const webglVertexArrayMap = new Map<number, WebGLVertexArrayObject>();

  const memoryView = new DataView(memory.buffer);

  let currentProgramInfo: ProgramInfo | undefined;

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
      throw new Error("not implemented");
      // return webgl!.getStringi();
    },
    /**
     * @param pname
     *  GLenum
     * @param params_ptr
     *  GLint
     * @returns
     */
    glGetIntegerv: (pname: number, params_ptr: number) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      console.debug("pname", pname.toString(16));
      switch (pname) {
        case 0x821d: // GL_NUM_EXTENSIONS
          {
            const value = webgl.getSupportedExtensions.length;
            memoryView.setInt32(params_ptr, value, true);
          }
          break;
        default:
          {
            const value = webgl.getParameter(pname);
            memoryView.setInt32(params_ptr, value, true);
          }
          break;
      }
    },
    glGetString: (name: number) => {
      console.debug("glGetString", name.toString(16));
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      let ret = stringCache.get(name);
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
      stringCache.set(name, ret);
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
    /**
     * void glShaderSource(
     *   GLuint shader,
     *   GLsizei count,
     *   const GLchar **string,
     *   const GLint *length);
     */
    glShaderSource: (
      shaderId: number,
      count: number,
      string_ptr: number,
      length_ptr: number
    ) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      const shader = webglShaderMap.get(shaderId);
      if (!shader) {
        throw new Error("shader not found");
      }
      const decoder = new TextDecoder();
      let source = "";
      for (let i = 0; i < count; i++) {
        const ptr = memoryView.getUint32(string_ptr + i * 4, true);
        const length = memoryView.getUint32(length_ptr + i * 4, true);

        const bytes = new Uint8Array(memory.buffer, ptr, length);

        // NOTE: I cannot use bytes directly. that makes error -> TypeError: Failed to execute 'decode' on 'TextDecoder': The provided ArrayBufferView value must not be shared.
        const copied = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(copied).set(bytes);

        source += decoder.decode(copied, {
          stream: true,
        });
      }
      source += decoder.decode();
      console.debug("shader source", source);
      webgl.shaderSource(shader, source);
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
    /**
     * void glLinkProgram(GLuint program);
     */
    glLinkProgram: (programId: number) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      const programInfo = programInfos.get(programId);
      if (!programInfo) {
        throw new Error("program not found");
      }
      webgl.linkProgram(programInfo.program);
    },
    glLineWidth: (width: number) => {
      return webgl!.lineWidth(width);
    },
    glIsTexture: () => {
      throw new Error("not implemented");
      // return webgl!.isTexture();
    },
    /**
     * GLint glGetUniformLocation(
     *  GLuint program,
     *  const GLchar *name
     * );
     */
    glGetUniformLocation: (programId: number, name_ptr: number): number => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      const programInfo = programInfos.get(programId);
      if (!programInfo) {
        throw new Error("program not found");
      }
      const nameBytes = [];
      while (true) {
        const byte = memoryView.getUint8(name_ptr + nameBytes.length);
        if (byte === 0) {
          break;
        }
        nameBytes.push(byte);
      }
      const name = new TextDecoder().decode(new Uint8Array(nameBytes));
      const cachedId = programInfo.uniformLocationNameToId.get(name);
      if (cachedId !== undefined) {
        return cachedId;
      }

      const location = webgl.getUniformLocation(programInfo.program, name);
      if (!location) {
        return -1;
      }
      programInfo.nameToUniformLocation.set(name, location);
      const id = programInfo.nameToUniformLocation.size;
      programInfo.uniformLocationNameToId.set(name, id);
      programInfo.idToUniformLocation.set(id, location);
      return id;
    },
    /**
     * void glGetShaderiv(
     *  GLuint shader,
     *  GLenum pname,
     *  GLint *params);
     */
    glGetShaderiv: (shaderId: number, pname: number, params_ptr: number) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      const shader = webglShaderMap.get(shaderId);
      if (!shader) {
        throw new Error("shader not found");
      }

      switch (pname) {
        case 0x8b84: // INFO_LOG_LENGTH
          {
            const log = webgl.getShaderInfoLog(shader);
            console.debug("shaderInfoLog", log);
            memoryView.setInt32(params_ptr, log ? log.length + 1 : 0, true);
          }
          break;
        case 0x8b88: // SHADER_SOURCE_LENGTH
          {
            throw new Error("not implemented");
          }
          break;
        default: {
          const value = webgl.getShaderParameter(shader, pname);
          memoryView.setInt32(params_ptr, value, true);
        }
      }
    },
    /**
     * void glGetShaderInfoLog(
     *  GLuint shader,
     *  GLsizei maxLength,
     *  GLsizei *length,
     *  GLchar *infoLog
     * );
     */
    glGetShaderInfoLog: (
      shaderId: number,
      maxLength: number,
      length_ptr: number,
      infoLog_ptr: number
    ) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      const shader = webglShaderMap.get(shaderId);
      if (!shader) {
        throw new Error("shader not found");
      }
      let log = webgl.getShaderInfoLog(shader);
      if (!log) {
        return memoryView.setInt32(length_ptr, 0, true);
      }

      if (log.length + 1 > maxLength) {
        log = log.slice(0, maxLength - 1);
      }

      const bytes = new TextEncoder().encode(log);
      const buffer = new Uint8Array(memory.buffer);
      buffer.set(bytes, infoLog_ptr);
      // add null terminator
      buffer[infoLog_ptr + bytes.length] = 0;
      memoryView.setInt32(length_ptr, bytes.length, true);
    },
    /**
     * void glGetProgramiv(
     *  GLuint program,
     *  GLenum pname,
     *  GLint *params
     * );
     */
    glGetProgramiv: (programId: number, pname: number, params_ptr: number) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      const programInfo = programInfos.get(programId);
      if (!programInfo) {
        throw new Error("program not found");
      }

      const value = webgl.getProgramParameter(programInfo.program, pname);
      memoryView.setInt32(params_ptr, value, true);
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
    /**
     * @param n
     *  GLsizei
     *  Specifies the number of buffer object names to be generated.
     *
     *  @param buffers
     *  GLuint *
     *  Specifies an array in which the generated buffer object names are stored.
     */
    glGenBuffers: (n: number, buffers_ptr: number) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      for (let i = 0; i < n; i++) {
        const buffer = webgl.createBuffer();
        if (!buffer) {
          throw new Error("Failed to create buffer");
        }
        const bufferId = nextBufferId++;
        webglBufferMap.set(bufferId, buffer);
        memoryView.setUint32(buffers_ptr + i * 4, bufferId, true);
      }
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
    /**
     * void glDeleteShader(GLuint shader);
     */
    glDeleteShader: (shaderId: number) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      const shader = webglShaderMap.get(shaderId);
      if (!shader) {
        throw new Error("shader not found");
      }
      webgl.deleteShader(shader);
      webglShaderMap.delete(shaderId);
    },
    /**
     * void glDeleteProgram(GLuint program);
     */
    glDeleteProgram: (programId: number) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      const programInfo = programInfos.get(programId);
      if (!programInfo) {
        throw new Error("program not found");
      }
      webgl.deleteProgram(programInfo.program);
      programInfos.delete(programId);
      if (currentProgramInfo === programInfo) {
        currentProgramInfo = undefined;
      }
    },
    /**
     * void glDeleteBuffers(
     *  GLsizei n,
     *  const GLuint * buffers
     * );
     */
    glDeleteBuffers: (n: number, buffers_ptr: number) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      for (let i = 0; i < n; i++) {
        const bufferId = memoryView.getUint32(buffers_ptr + i * 4, true);
        const buffer = webglBufferMap.get(bufferId);
        if (!buffer) {
          throw new Error("buffer not found");
        }
        webgl.deleteBuffer(buffer);
        webglBufferMap.delete(bufferId);
      }
    },
    glCullFace: (mode: number) => {
      return webgl!.cullFace(mode);
    },
    /**
     * GLuint glCreateShader(
     *  GLenum type
     * );
     */
    glCreateShader: (type: number): number => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      const shader = webgl.createShader(type);
      if (!shader) {
        throw new Error("Failed to create shader");
      }
      const shaderId = nextShaderId++;
      webglShaderMap.set(shaderId, shader);
      return shaderId;
    },
    /**
     * GLuint glCreateProgram(void);
     */
    glCreateProgram: (): number => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      const program = webgl.createProgram();
      if (!program) {
        throw new Error("Failed to create program");
      }
      const programId = nextProgramId++;
      programInfos.set(programId, {
        program,
        nameToUniformLocation: new Map(),
        uniformLocationNameToId: new Map(),
        idToUniformLocation: new Map(),
      });
      return programId;
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
    /**
     * void glCompileShader(GLuint shader);
     */
    glCompileShader: (shaderId: number) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      const shader = webglShaderMap.get(shaderId);
      if (!shader) {
        throw new Error("shader not found");
      }
      webgl.compileShader(shader);
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
    /**
     * void glBufferSubData(
     *  GLenum target,
     *  GLintptr offset,
     *  GLsizeiptr size,
     *  const void * data);
     */
    glBufferSubData: (
      target: number,
      offset: number,
      size: number,
      data_ptr: number
    ) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      const srcData = new Uint8Array(memory.buffer, data_ptr, size);
      webgl.bufferSubData(target, offset, srcData, 0, size);
    },
    /**
     * void glBufferData(
     *  GLenum target,
     *  GLsizeiptr size,
     *  const void * data,
     *  GLenum usage);
     */
    glBufferData: (
      target: number,
      size: number,
      data_ptr: number,
      usage: number
    ) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }

      if (!data_ptr) {
        return webgl.bufferData(target, size, usage);
      }

      const srcData = new Uint8Array(memory.buffer, data_ptr, size);
      webgl.bufferData(target, srcData, usage);
    },
    glBlendFunc: webgl?.blendFunc.bind(webgl) || (() => {}),
    glBlendEquation: webgl?.blendEquation.bind(webgl) || (() => {}),
    glBlendColor: webgl?.blendColor.bind(webgl) || (() => {}),
    glBindTexture: () => {
      throw new Error("not implemented");
      // return webgl!.bindTexture();
    },
    /**
     * void glBindBuffer(GLenum target, GLuint buffer);
     *
     */
    glBindBuffer: (target: number, bufferId: number) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      const buffer = webglBufferMap.get(bufferId);
      if (!buffer) {
        throw new Error("buffer not found");
      }
      webgl.bindBuffer(target, buffer);
    },
    /**
     * void glBindAttribLocation(
     *  GLuint program,
     *  GLuint index,
     *  const GLchar *name
     * );
     */
    glBindAttribLocation: (
      programId: number,
      index: number,
      name_ptr: number
    ) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      const programInfo = programInfos.get(programId);
      if (!programInfo) {
        throw new Error("program not found");
      }
      const nameBytes = [];
      while (true) {
        const byte = memoryView.getUint8(name_ptr + nameBytes.length);
        if (byte === 0) {
          break;
        }
        nameBytes.push(byte);
      }
      const name = new TextDecoder().decode(new Uint8Array(nameBytes));
      console.debug("name", name);
      webgl.bindAttribLocation(programInfo.program, index, name);
    },
    /**
     * void glAttachShader(
     *  GLuint program,
     *  GLuint shader
     * );
     */
    glAttachShader: (programId: number, shaderId: number) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      const programInfo = programInfos.get(programId);
      if (!programInfo) {
        throw new Error("program not found");
      }
      const shader = webglShaderMap.get(shaderId);
      if (!shader) {
        throw new Error("shader not found");
      }
      webgl.attachShader(programInfo.program, shader);
    },
    glActiveTexture: webgl?.activeTexture.bind(webgl) || (() => {}),
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
    glUniform4f: () => {
      throw new Error("not implemented");
    },
    /**
     * void glUniform4fv(
     *  GLint location,
     *  GLsizei count,
     *  const GLfloat *value
     * );
     */
    glUniform4fv: (location_id: number, count: number, value_ptr: number) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      if (!currentProgramInfo) {
        throw new Error("current program is not set");
      }
      const uniformLocation =
        currentProgramInfo.idToUniformLocation.get(location_id);
      if (!uniformLocation) {
        throw new Error("uniform not found");
      }
      const value = new Float32Array(memory.buffer, value_ptr, count * 4);
      webgl.uniform4fv(uniformLocation, value);
    },
    glViewport: webgl?.viewport.bind(webgl) || (() => {}),
    /**
     * void glVertexAttribPointer(
     *  GLuint index,
     *  GLint size,
     *  GLenum type,
     *  GLboolean normalized,
     *  GLsizei stride,
     *  const void * pointer);
     */
    glVertexAttribPointer: (
      index: number,
      size: number,
      type: number,
      normalized: number,
      stride: number,
      pointer: number
    ) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      if (
        ![
          webgl.BYTE,
          webgl.SHORT,
          webgl.UNSIGNED_BYTE,
          webgl.UNSIGNED_SHORT,
          webgl.FLOAT,
          webgl.HALF_FLOAT,
          webgl.INT,
          webgl.UNSIGNED_INT,
          webgl.INT_2_10_10_10_REV,
          webgl.UNSIGNED_INT_2_10_10_10_REV,
        ].includes(type as any)
      ) {
        throw new Error(`Invalid type: ${type}`);
      }

      webgl.vertexAttribPointer(
        index,
        size,
        type,
        !!normalized,
        stride,
        pointer
      );
    },
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
    /**
     * void glUseProgram(GLuint program);
     */
    glUseProgram: (programId: number) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      if (programId === 0) {
        webgl.useProgram(null);
        currentProgramInfo = undefined;
        return;
      }
      const programInfo = programInfos.get(programId);
      if (!programInfo) {
        throw new Error("program not found");
      }
      webgl.useProgram(programInfo.program);
      currentProgramInfo = programInfo;
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
    /**
     * void glBindVertexArray(GLuint array);
     */
    glBindVertexArray: (arrayId: number) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      if (arrayId === 0) {
        return webgl.bindVertexArray(null);
      }
      const vertexArray = webglVertexArrayMap.get(arrayId);
      if (!vertexArray) {
        throw new Error("vertexArray not found");
      }
      webgl.bindVertexArray(vertexArray);
    },
    glDrawElementsInstanced:
      webgl?.drawElementsInstanced.bind(webgl) || (() => {}),
    glDrawArraysInstanced: webgl?.drawArraysInstanced.bind(webgl) || (() => {}),
    glDrawElementsInstancedBaseVertexBaseInstanceWEBGL: () => {
      throw new Error("not implemented");
    },
    glDrawArraysInstancedBaseInstanceWEBGL: () => {
      throw new Error("not implemented");
    },
    glReadBuffer: webgl?.readBuffer.bind(webgl) || (() => {}),
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
    glVertexAttribIPointer:
      webgl?.vertexAttribIPointer.bind(webgl) || (() => {}),
    glVertexAttribDivisor: webgl?.vertexAttribDivisor.bind(webgl) || (() => {}),
    glTexStorage2D: webgl?.texStorage2D.bind(webgl) || (() => {}),
    glDrawRangeElements: webgl?.drawRangeElements.bind(webgl) || (() => {}),
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
    glCheckFramebufferStatus:
      webgl?.checkFramebufferStatus.bind(webgl) || (() => {}),
    glBindRenderbuffer: () => {
      throw new Error("not implemented");
      // return webgl!.bindRenderbuffer();
    },
    glBindFramebuffer: (target: number, framebuffer: number) => {
      if (!framebuffer) {
        return webgl!.bindFramebuffer(target, null);
      }
      throw new Error("not implemented");
      // return webgl!.bindFramebuffer(target, unknown);
    },
    glRenderbufferStorage: webgl?.renderbufferStorage.bind(webgl) || (() => {}),
    glGetRenderbufferParameteriv: () => {
      throw new Error("not implemented");
      // return webgl!.getRenderbufferParameteriv();
    },
    glGetFramebufferAttachmentParameteriv: () => {
      throw new Error("not implemented");
      // return webgl!.getFramebufferAttachmentParameteriv();
    },
    glGenerateMipmap: webgl?.generateMipmap.bind(webgl) || (() => {}),
    glRenderbufferStorageMultisample:
      webgl?.renderbufferStorageMultisample || (() => {}),
    glBlitFramebuffer: webgl?.blitFramebuffer.bind(webgl) || (() => {}),
    glDeleteSync: () => {
      throw new Error("not implemented");
      // return webgl!.deleteSync();
    },
    glClientWaitSync: () => {
      throw new Error("not implemented");
      // return webgl!.clientWaitSync();
    },
    glCopyBufferSubData: webgl?.copyBufferSubData.bind(webgl) || (() => {}),
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
    /**
     * void glGetShaderPrecisionFormat(
     *  GLenum shaderType,
     *  GLenum precisionType,
     *  GLint *range,
     *  GLint *precision
     * );
     * Parameters
     *  shaderType
     *  Specifies the type of shader whose precision to query. shaderType must be GL_VERTEX_SHADER or GL_FRAGMENT_SHADER.
     *
     *  precisionType
     *  Specifies the numeric format whose precision and range to query.
     *
     *  range
     *  Specifies the address of array of two integers into which encodings of the implementation's numeric range are returned.
     *
     *  precision
     *  Specifies the address of an integer into which the numeric precision of the implementation is written.
     */
    glGetShaderPrecisionFormat: (
      shaderType: number,
      precisionType: number,
      rangePtr: number,
      precisionPtr: number
    ) => {
      if (!webgl) {
        throw new Error("webgl is not set");
      }
      const shaderPrecisionFormat = webgl.getShaderPrecisionFormat(
        shaderType,
        precisionType
      );
      if (!shaderPrecisionFormat) {
        throw new Error("Failed to get shader precision format");
      }

      memoryView.setInt32(rangePtr, shaderPrecisionFormat.rangeMin, true);
      memoryView.setInt32(rangePtr + 4, shaderPrecisionFormat.rangeMax, true);
      memoryView.setInt32(precisionPtr, shaderPrecisionFormat.precision, true);
    },
  };
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
