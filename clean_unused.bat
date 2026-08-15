@echo off
echo Cleaning unused PojavLauncher fragments and layouts for CobbleSaS Mobile V2...

set FRAG_DIR=app_pojavlauncher\src\main\java\net\kdt\pojavlaunch\fragments
set PREF_DIR=app_pojavlauncher\src\main\java\net\kdt\pojavlaunch\prefs\screens
set LAYOUT_DIR=app_pojavlauncher\src\main\res\layout

echo Deleting unused fragment Java files...
del /q "%FRAG_DIR%\BTAInstallFragment.java" 2>nul
del /q "%FRAG_DIR%\DeleteConfirmDialogFragment.java" 2>nul
del /q "%FRAG_DIR%\ElyByLoginFragment.java" 2>nul
del /q "%FRAG_DIR%\FabricInstallFragment.java" 2>nul
del /q "%FRAG_DIR%\FabriclikeInstallFragment.java" 2>nul
del /q "%FRAG_DIR%\FileSelectorFragment.java" 2>nul
del /q "%FRAG_DIR%\ForgeInstallFragment.java" 2>nul
del /q "%FRAG_DIR%\ForgelikeInstallFragment.java" 2>nul
del /q "%FRAG_DIR%\GamepadMapperFragment.java" 2>nul
del /q "%FRAG_DIR%\InstanceEditorFragment.java" 2>nul
del /q "%FRAG_DIR%\LegacyFabricInstallFragment.java" 2>nul
del /q "%FRAG_DIR%\LocalLoginFragment.java" 2>nul
del /q "%FRAG_DIR%\MainMenuFragment.java" 2>nul
del /q "%FRAG_DIR%\MicrosoftLoginFragment.java" 2>nul
del /q "%FRAG_DIR%\ModVersionListFragment.java" 2>nul
del /q "%FRAG_DIR%\NeoforgeInstallFragment.java" 2>nul
del /q "%FRAG_DIR%\OAuthFragment.java" 2>nul
del /q "%FRAG_DIR%\OptiFineInstallFragment.java" 2>nul
del /q "%FRAG_DIR%\ProfileTypeSelectFragment.java" 2>nul
del /q "%FRAG_DIR%\QuiltInstallFragment.java" 2>nul
del /q "%FRAG_DIR%\SearchModFragment.java" 2>nul
del /q "%FRAG_DIR%\SelectAuthFragment.java" 2>nul
del /q "%FRAG_DIR%\WebViewCompletionFragment.java" 2>nul

echo Deleting unused preference screens folder...
rmdir /s /q "%PREF_DIR%" 2>nul

echo Deleting unused XML layout files...
del /q "%LAYOUT_DIR%\fragment_bta_install.xml" 2>nul
del /q "%LAYOUT_DIR%\fragment_ely_login.xml" 2>nul
del /q "%LAYOUT_DIR%\fragment_fabric_install.xml" 2>nul
del /q "%LAYOUT_DIR%\fragment_file_selector.xml" 2>nul
del /q "%LAYOUT_DIR%\fragment_gamepad_mapper.xml" 2>nul
del /q "%LAYOUT_DIR%\fragment_instance_editor.xml" 2>nul
del /q "%LAYOUT_DIR%\fragment_local_login.xml" 2>nul
del /q "%LAYOUT_DIR%\fragment_main_menu.xml" 2>nul
del /q "%LAYOUT_DIR%\fragment_microsoft_login.xml" 2>nul
del /q "%LAYOUT_DIR%\fragment_mod_version_list.xml" 2>nul
del /q "%LAYOUT_DIR%\fragment_oauth.xml" 2>nul
del /q "%LAYOUT_DIR%\fragment_optifine_install.xml" 2>nul
del /q "%LAYOUT_DIR%\fragment_profile_type_select.xml" 2>nul
del /q "%LAYOUT_DIR%\fragment_search_mod.xml" 2>nul
del /q "%LAYOUT_DIR%\fragment_select_auth.xml" 2>nul
del /q "%LAYOUT_DIR%\fragment_webview_completion.xml" 2>nul
del /q "%LAYOUT_DIR%\dialog_java_memory.xml" 2>nul
del /q "%LAYOUT_DIR%\activity_pojav_launcher.xml" 2>nul
del /q "%LAYOUT_DIR%\fragment_launcher.xml" 2>nul
del /q "%LAYOUT_DIR%\fragment_select_auth_method.xml" 2>nul
del /q "%LAYOUT_DIR%\fragment_profile_type.xml" 2>nul
del /q "%LAYOUT_DIR%\fragment_mod_search.xml" 2>nul
del /q "%LAYOUT_DIR%\fragment_controller_remapper.xml" 2>nul
del /q "%LAYOUT_DIR%\item_account.xml" 2>nul

echo Done! Unused Pojav UI components successfully removed.
pause
