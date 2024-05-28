/*
 * Copyright 2018 Google Inc.
 *
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

#ifndef SkiaVulkan_DEFINED
#define SkiaVulkan_DEFINED

#include "include/core/SkTypes.h"

// IWYU pragma: begin_exports

#if (SKIA_IMPLEMENTATION || !defined(SK_VULKAN)) && !defined(SK_USE_EXTERNAL_VULKAN_HEADERS)
#include "include/third_party/vulkan/vulkan/vulkan_core.h"
#else
// For google3 builds we don't set SKIA_IMPLEMENTATION so we need to make sure that the vulkan
// headers stay up to date for our needs
#include <vulkan/vulkan_core.h>
#endif

#ifdef SK_BUILD_FOR_ANDROID
// This is needed to get android extensions for external memory
#if (SKIA_IMPLEMENTATION || !defined(SK_VULKAN)) && !defined(SK_USE_EXTERNAL_VULKAN_HEADERS)
#include "include/third_party/vulkan/vulkan/vulkan_android.h"
#else
// For google3 builds we don't set SKIA_IMPLEMENTATION so we need to make sure that the vulkan
// headers stay up to date for our needs
#include <vulkan/vulkan_android.h>
#endif
#endif

// IWYU pragma: end_exports

#endif
