!include LogicLib.nsh

; v1.0.2 stored its portable data beside the executable. Preserve that data
; before the old uninstaller removes the installation directory.
!macro customInit
  ${IfNot} ${FileExists} "$LOCALAPPDATA\Ebook Viewer\data.json"
    ${If} ${FileExists} "$INSTDIR\data\data.json"
      CreateDirectory "$LOCALAPPDATA\Ebook Viewer"
      CreateDirectory "$LOCALAPPDATA\Ebook Viewer\books"
      CreateDirectory "$LOCALAPPDATA\Ebook Viewer\fonts"
      CreateDirectory "$LOCALAPPDATA\Ebook Viewer\exports"
      CopyFiles /SILENT "$INSTDIR\data\data.json" "$LOCALAPPDATA\Ebook Viewer\data.json"
      CopyFiles /SILENT "$INSTDIR\data\books\*.*" "$LOCALAPPDATA\Ebook Viewer\books"
      CopyFiles /SILENT "$INSTDIR\data\fonts\*.*" "$LOCALAPPDATA\Ebook Viewer\fonts"
      CopyFiles /SILENT "$INSTDIR\data\exports\*.*" "$LOCALAPPDATA\Ebook Viewer\exports"
    ${EndIf}
  ${EndIf}
!macroend
