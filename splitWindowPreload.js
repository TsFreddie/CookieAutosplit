const {contextBridge,ipcRenderer,webFrame}=require('electron');

contextBridge.exposeInMainWorld(
	'bot',{
		setZoom:(zoom)=>webFrame.setZoomLevel(zoom),
	}
);