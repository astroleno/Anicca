main-app.js?v=1760375460011:182 A preload for 'https://unpkg.com/shader-park-core/dist/shader-park-core.esm.js' is found, but is not used because the request credentials mode does not match. Consider taking a look at crossorigin attribute.
eval @ app-bootstrap.js:42
eval @ app-bootstrap.js:29
Promise.then
eval @ app-bootstrap.js:28
loadScriptsInSequence @ app-bootstrap.js:26
appBootstrap @ app-bootstrap.js:53
eval @ app-next-dev.js:13
(app-pages-browser)/./node_modules/next/dist/client/app-next-dev.js @ main-app.js?v=1760375460011:182
options.factory @ webpack.js:1
__webpack_require__ @ webpack.js:1
__webpack_exec__ @ main-app.js?v=1760375460011:1889
(anonymous) @ main-app.js?v=1760375460011:1890
webpackJsonpCallback @ webpack.js:1
(anonymous) @ main-app.js?v=1760375460011:9
shader-park-core.esm.js:97508 using shader-park-core version: 0.2.8
main-app.js?v=1760375460011:1181 Download the React DevTools for a better development experience: https://react.dev/link/react-devtools
VM4347:6 ✅ Shader Park 全局加载完成
250[TextureView of Texture "IOSurface(RasterRead|DisplayRead|Scanout|WebgpuRead|WebgpuSwapChainTexture|WebgpuWrite)"] is associated with [Device], and cannot be used with [Device].
 - While validating colorAttachments[0].
 - While encoding [CommandEncoder (unlabeled)].BeginRenderPass([RenderPassDescriptor]).
 - While finishing [CommandEncoder (unlabeled)].

250[Invalid CommandBuffer] is invalid.
 - While calling [Queue].Submit([[Invalid CommandBuffer]])

newframe:1 Uncaught (in promise) {name: 'i', httpError: false, httpStatus: 200, httpStatusText: '', code: 403, …}
newframe:1 Uncaught (in promise) {name: 'i', httpError: false, httpStatus: 200, httpStatusText: '', code: 403, …}
newframe:1 WebGPU: too many warnings, no more warnings will be reported to the console for this GPUDevice.
newframe:1 The resource https://unpkg.com/shader-park-core/dist/shader-park-core.esm.js was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.