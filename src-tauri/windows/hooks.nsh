; Glint's NSIS installer hooks (bundle.windows.nsis.installerHooks).
;
; Adds Glint to Explorer's "Open with" list for the formats it plays through
; its bundled FFmpeg, without taking over the default app for any of them.
; Windows reads `HKCU\Software\Classes\.<ext>\OpenWithProgids` for that list:
; https://learn.microsoft.com/windows/win32/shell/fa-progids
; MP4, M4V and WebM keep their regular file associations (tauri.conf.json).

!define GLINT_PROGID "Glint.Video"

!macro GLINT_OPEN_WITH EXT
  WriteRegStr HKCU "Software\Classes\.${EXT}\OpenWithProgids" "${GLINT_PROGID}" ""
!macroend

!macro GLINT_FORGET_OPEN_WITH EXT
  DeleteRegValue HKCU "Software\Classes\.${EXT}\OpenWithProgids" "${GLINT_PROGID}"
  DeleteRegKey /ifempty HKCU "Software\Classes\.${EXT}\OpenWithProgids"
  DeleteRegKey /ifempty HKCU "Software\Classes\.${EXT}"
!macroend

!macro GLINT_EACH_EXT MACRO
  !insertmacro ${MACRO} "mkv"
  !insertmacro ${MACRO} "mov"
  !insertmacro ${MACRO} "avi"
  !insertmacro ${MACRO} "wmv"
  !insertmacro ${MACRO} "asf"
  !insertmacro ${MACRO} "flv"
  !insertmacro ${MACRO} "f4v"
  !insertmacro ${MACRO} "ts"
  !insertmacro ${MACRO} "m2ts"
  !insertmacro ${MACRO} "mts"
  !insertmacro ${MACRO} "mpg"
  !insertmacro ${MACRO} "mpeg"
  !insertmacro ${MACRO} "vob"
  !insertmacro ${MACRO} "3gp"
  !insertmacro ${MACRO} "ogv"
  !insertmacro ${MACRO} "divx"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\${GLINT_PROGID}" "" "Video file"
  WriteRegStr HKCU "Software\Classes\${GLINT_PROGID}" "FriendlyTypeName" "Video file"
  WriteRegStr HKCU "Software\Classes\${GLINT_PROGID}\DefaultIcon" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
  WriteRegStr HKCU "Software\Classes\${GLINT_PROGID}\shell\open" "" "Open with ${PRODUCTNAME}"
  WriteRegStr HKCU "Software\Classes\${GLINT_PROGID}\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
  !insertmacro GLINT_EACH_EXT GLINT_OPEN_WITH
  ; SHCNE_ASSOCCHANGED, so Explorer picks up the new entries.
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; An update reinstalls straight away, so keep the entries then.
  ${If} $UpdateMode <> 1
    !insertmacro GLINT_EACH_EXT GLINT_FORGET_OPEN_WITH
    DeleteRegKey HKCU "Software\Classes\${GLINT_PROGID}"
    System::Call "shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)"
  ${EndIf}
!macroend
