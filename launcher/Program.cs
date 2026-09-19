using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;

namespace WhatsAppLauncher;

class Program
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBox(IntPtr hWnd, string text, string caption, uint type);

    private static void ShowErrorMessage(string title, string message)
    {
        try
        {
            MessageBox(IntPtr.Zero, message, title, 0x00000010 /* MB_ICONERROR */ | 0x00000000 /* MB_OK */);
        }
        catch { }
    }

    static async Task Main(string[] args)
    {
        string installDir = ResolveInstallDirectory();
        string targetExe = Path.Combine(installDir, "WhatsApp-System.exe");
        string currentExe = Environment.ProcessPath ?? "";

        // 1. Single Instance Protection ueber aktive Prozesspruefung
        int currentPid = Environment.ProcessId;
        var runningInstance = Process.GetProcessesByName("WhatsApp-System")
            .FirstOrDefault(p => p.Id != currentPid);
        if (runningInstance != null)
        {
            OpenExistingInstance(installDir);
            return;
        }

        try
        {
            Directory.CreateDirectory(installDir);

            // 2. Selbstverteilung: Falls von woanders gestartet (z.B. Downloads, USB, Ordner)
            // Alles kommt bei %AppData% rein und erstellt eine Verknuepfung auf dem Desktop
            if (!string.IsNullOrEmpty(currentExe))
            {
                if (!string.Equals(currentExe, targetExe, StringComparison.OrdinalIgnoreCase))
                {
                    try
                    {
                        File.Copy(currentExe, targetExe, true);
                    }
                    catch { }

                    string? sourceDir = Path.GetDirectoryName(currentExe);
                    if (!string.IsNullOrEmpty(sourceDir) && Directory.Exists(sourceDir))
                    {
                        if (File.Exists(Path.Combine(sourceDir, "server.js")))
                        {
                            try { CopyDirectory(sourceDir, installDir); } catch { }
                        }
                    }
                }
            }

            // 3. Desktop-Verknuepfung erstellen / sicherstellen
            EnsureDesktopShortcut(targetExe, installDir);

            // 4. Sicherstellen, dass die App-Dateien in installDir vorhanden sind
            if (!File.Exists(Path.Combine(installDir, "server.js")))
            {
                await InstallOrDownloadApp(installDir);
            }

            // 5. Alte Sperren und Ports aufraeumen
            CleanupLocksAndProcesses(installDir);

            // 6. Node.js Laufzeitumgebung und Module garantieren
            string nodePath = await EnsureNodeExecutableAndDependencies(installDir);

            // 7. Node.js Server starten mit Logging und dynamischem Port
            string serverLogFile = Path.Combine(installDir, "server.log");
            try
            {
                File.AppendAllText(serverLogFile, $"\r\n=== WhatsApp-System Start: {DateTime.Now:yyyy-MM-dd HH:mm:ss} ===\r\n");
            }
            catch { }

            var nodePsi = new ProcessStartInfo
            {
                FileName = nodePath,
                Arguments = "server.js --no-browser",
                WorkingDirectory = installDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            nodePsi.EnvironmentVariables["LAUNCHER_MANAGED"] = "1";

            Process? nodeProc = new Process { StartInfo = nodePsi };
            nodeProc.OutputDataReceived += (s, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                {
                    try { File.AppendAllText(serverLogFile, $"[NODE] {e.Data}\r\n"); } catch { }
                }
            };
            nodeProc.ErrorDataReceived += (s, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                {
                    try { File.AppendAllText(serverLogFile, $"[NODE-ERR] {e.Data}\r\n"); } catch { }
                }
            };

            nodeProc.Start();
            nodeProc.BeginOutputReadLine();
            nodeProc.BeginErrorReadLine();

            // 8. Warten bis Server ansprechbar ist und Port ermitteln
            string activePortFile = Path.Combine(installDir, ".active_port");
            int activePort = 0;

            using (var waitHttp = new HttpClient { Timeout = TimeSpan.FromMilliseconds(600) })
            {
                for (int i = 0; i < 80; i++)
                {
                    if (nodeProc.HasExited)
                    {
                        break;
                    }

                    if (activePort == 0 && File.Exists(activePortFile))
                    {
                        try
                        {
                            string content = File.ReadAllText(activePortFile).Trim();
                            if (int.TryParse(content, out int p) && p > 0)
                            {
                                activePort = p;
                            }
                        }
                        catch { }
                    }

                    if (activePort > 0)
                    {
                        try
                        {
                            var res = await waitHttp.GetAsync($"http://localhost:{activePort}/api/ready");
                            if (res.IsSuccessStatusCode) break;
                        }
                        catch
                        {
                            try
                            {
                                var res2 = await waitHttp.GetAsync($"http://127.0.0.1:{activePort}/api/ready");
                                if (res2.IsSuccessStatusCode) break;
                            }
                            catch { }
                        }
                    }
                    await Task.Delay(500);
                }
            }

            // 9. Desktop-App-Fenster oeffnen oder Fehler melden
            if (activePort > 0)
            {
                LaunchAppWindow($"http://localhost:{activePort}");
            }
            else
            {
                string errMsg = "WhatsApp-System konnte nicht gestartet werden.\r\n\r\n";
                if (File.Exists(serverLogFile))
                {
                    try
                    {
                        var lines = File.ReadAllLines(serverLogFile);
                        var nonNull = lines.Where(l => !string.IsNullOrWhiteSpace(l)).TakeLast(8);
                        errMsg += "Fehlerprotokoll:\r\n" + string.Join("\r\n", nonNull);
                    }
                    catch { }
                }
                ShowErrorMessage("NightSystem WhatsApp - Startfehler", errMsg);
            }

            // 10. Launcher haelt den Prozess am Leben bis der Server beendet wird
            if (nodeProc != null && !nodeProc.HasExited)
            {
                await nodeProc.WaitForExitAsync();
            }
        }
        catch (Exception ex)
        {
            try
            {
                string crashLog = Path.Combine(installDir, "launcher_crash.log");
                File.WriteAllText(crashLog, $"[{DateTime.Now}] Launcher Exception:\r\n{ex}");
            }
            catch { }
            Debug.WriteLine(ex);
        }
    }

    private static string ResolveInstallDirectory()
    {
        string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        if (string.IsNullOrWhiteSpace(appData))
        {
            string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (string.IsNullOrWhiteSpace(userProfile))
            {
                userProfile = Environment.GetEnvironmentVariable("USERPROFILE") ?? Path.Combine(@"C:\Users", Environment.UserName);
            }
            appData = Path.Combine(userProfile, "AppData", "Roaming");
        }

        string targetDir = Path.Combine(appData, "WhatsApp");
        if (!Directory.Exists(targetDir))
        {
            string oldDir = Path.Combine(appData, "NightSystem", "WhatsApp");
            if (Directory.Exists(oldDir))
            {
                try
                {
                    Directory.Move(oldDir, targetDir);
                }
                catch
                {
                    return oldDir;
                }
            }
        }
        Directory.CreateDirectory(targetDir);
        return targetDir;
    }

    private static void EnsureDesktopShortcut(string targetExePath, string installDir)
    {
        try
        {
            string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            if (string.IsNullOrWhiteSpace(desktopDir))
            {
                desktopDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Desktop");
            }

            string shortcutPath = Path.Combine(desktopDir, "WhatsApp-System.lnk");

            Type? shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType != null)
            {
                dynamic shell = Activator.CreateInstance(shellType)!;
                dynamic shortcut = shell.CreateShortcut(shortcutPath);
                shortcut.TargetPath = targetExePath;
                shortcut.WorkingDirectory = installDir;
                string iconPath = Path.Combine(installDir, "icon.ico");
                if (!File.Exists(iconPath))
                {
                    iconPath = targetExePath;
                }
                shortcut.IconLocation = $"{iconPath},0";
                shortcut.Description = "WhatsApp-System";
                shortcut.Save();
            }

            // Alte Downloader-Dateien auf Desktop aufraeumen
            string oldDownloaderExe = Path.Combine(desktopDir, "WhatsApp-Downloader.exe");
            if (File.Exists(oldDownloaderExe))
            {
                try { File.Delete(oldDownloaderExe); } catch { }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("Fehler beim Erstellen der Desktop-Verknuepfung: " + ex.Message);
        }
    }

    private static void OpenExistingInstance(string installDir)
    {
        try
        {
            string activePortFile = Path.Combine(installDir, ".active_port");
            if (File.Exists(activePortFile))
            {
                string content = File.ReadAllText(activePortFile).Trim();
                if (int.TryParse(content, out int port) && port > 0)
                {
                    LaunchAppWindow($"http://localhost:{port}");
                }
            }
        }
        catch { }
    }

    private static async Task<string> EnsureNodeExecutableAndDependencies(string installDir)
    {
        string runtimeNode = Path.Combine(installDir, "runtime", "node.exe");
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string localRuntimeNode = Path.Combine(baseDir, "runtime", "node.exe");

        bool hasModules = Directory.Exists(Path.Combine(installDir, "node_modules", "express")) &&
                          Directory.Exists(Path.Combine(installDir, "node_modules", "whatsapp-web.js"));

        // Falls Runtime oder Module fehlen: Komplettes Runtime-Paket nachladen
        if (!File.Exists(runtimeNode) || !hasModules)
        {
            string localPack = Path.Combine(baseDir, "runtime_pack.zip");
            string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            string desktopPack = Path.Combine(desktopDir, "WhatsApp", "runtime_pack.zip");

            if (File.Exists(localPack))
            {
                try { ZipFile.ExtractToDirectory(localPack, installDir, overwriteFiles: true); } catch { }
            }
            else if (File.Exists(desktopPack))
            {
                try { ZipFile.ExtractToDirectory(desktopPack, installDir, overwriteFiles: true); } catch { }
            }
            else
            {
                try
                {
                    string runtimePackUrl = "https://github.com/NightSyste/whatsapp/raw/main/runtime_pack.zip";
                    string tempZip = Path.Combine(Path.GetTempPath(), "night_runtime_pack_launcher.zip");

                    using var client = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
                    client.DefaultRequestHeaders.UserAgent.ParseAdd("NightSystem-Launcher/1.0");
                    var bytes = await client.GetByteArrayAsync(runtimePackUrl);
                    await File.WriteAllBytesAsync(tempZip, bytes);

                    ZipFile.ExtractToDirectory(tempZip, installDir, overwriteFiles: true);
                    try { File.Delete(tempZip); } catch { }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine("Fehler beim Herunterladen des Runtime-Pakets: " + ex.Message);
                }
            }
        }

        if (File.Exists(runtimeNode)) return runtimeNode;
        if (File.Exists(localRuntimeNode)) return localRuntimeNode;

        string systemNode = FindSystemNodeExecutable();
        if (!string.IsNullOrEmpty(systemNode)) return systemNode;

        return "node";
    }

    private static string FindSystemNodeExecutable()
    {
        string[] candidates =
        {
            @"C:\Program Files\nodejs\node.exe",
            @"C:\Program Files (x86)\nodejs\node.exe",
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\node\node.exe")
        };

        foreach (var c in candidates)
        {
            if (File.Exists(c)) return c;
        }

        string? pathEnv = Environment.GetEnvironmentVariable("PATH");
        if (pathEnv != null)
        {
            foreach (var p in pathEnv.Split(';'))
            {
                string full = Path.Combine(p.Trim(), "node.exe");
                if (File.Exists(full)) return full;
            }
        }

        return "";
    }

    private static async Task InstallOrDownloadApp(string targetDir)
    {
        Directory.CreateDirectory(targetDir);

        // Option A: Lokale Entwicklungsdateien pruefen
        string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        string localSource = Path.Combine(desktopDir, "WhatsApp");
        if (File.Exists(Path.Combine(localSource, "server.js")))
        {
            try
            {
                CopyDirectory(localSource, targetDir);
                return;
            }
            catch { }
        }

        // Option B: Download von GitHub
        try
        {
            string zipUrl = "https://github.com/NightSyste/whatsapp/archive/refs/heads/main.zip";
            string tempZip = Path.Combine(Path.GetTempPath(), "whatsapp_night_system.zip");
            string tempExtract = Path.Combine(Path.GetTempPath(), "whatsapp_extract_" + Guid.NewGuid().ToString("N"));

            using var client = new HttpClient();
            client.DefaultRequestHeaders.UserAgent.ParseAdd("NightSystem-Installer");
            var zipBytes = await client.GetByteArrayAsync(zipUrl);
            await File.WriteAllBytesAsync(tempZip, zipBytes);

            if (Directory.Exists(tempExtract)) Directory.Delete(tempExtract, true);
            ZipFile.ExtractToDirectory(tempZip, tempExtract);

            string[] subdirs = Directory.GetDirectories(tempExtract);
            string sourceFolder = subdirs.Length > 0 ? subdirs[0] : tempExtract;

            CopyDirectory(sourceFolder, targetDir);

            try { File.Delete(tempZip); } catch { }
            try { Directory.Delete(tempExtract, true); } catch { }
        }
        catch { }
    }

    private static void CopyDirectory(string sourceDir, string destinationDir)
    {
        Directory.CreateDirectory(destinationDir);

        foreach (string file in Directory.GetFiles(sourceDir))
        {
            string destFile = Path.Combine(destinationDir, Path.GetFileName(file));
            File.Copy(file, destFile, true);
        }

        foreach (string subDir in Directory.GetDirectories(sourceDir))
        {
            string folderName = Path.GetFileName(subDir);
            if (folderName.Equals("launcher", StringComparison.OrdinalIgnoreCase) ||
                folderName.Equals("downloader", StringComparison.OrdinalIgnoreCase) ||
                folderName.Equals("bin", StringComparison.OrdinalIgnoreCase) ||
                folderName.Equals("obj", StringComparison.OrdinalIgnoreCase) ||
                folderName.Equals("dist", StringComparison.OrdinalIgnoreCase) ||
                folderName.Equals(".git", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            string destSubDir = Path.Combine(destinationDir, folderName);
            CopyDirectory(subDir, destSubDir);
        }
    }

    private static void CleanupLocksAndProcesses(string installDir)
    {
        try
        {
            string sessionDir = Path.Combine(installDir, ".wwebjs_auth", "session");
            if (Directory.Exists(sessionDir))
            {
                foreach (var fname in new[] { "lockfile", "SingletonLock", "SingletonCookie", "SingletonSocket", "DevToolsActivePort" })
                {
                    string p = Path.Combine(sessionDir, fname);
                    if (File.Exists(p))
                    {
                        try { File.Delete(p); } catch { }
                    }
                }
            }
        }
        catch { }

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -Command \"Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'chrome.exe' -or $_.Name -eq 'msedge.exe') -and ($_.CommandLine -like '*wwebjs_auth*' -or $_.CommandLine -like '*WhatsApp*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }\"",
                CreateNoWindow = true,
                UseShellExecute = false,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            using var p = Process.Start(psi);
            p?.WaitForExit(3000);
        }
        catch { }

        try
        {
            string portFile = Path.Combine(installDir, ".active_port");
            if (File.Exists(portFile))
            {
                File.Delete(portFile);
            }
        }
        catch { }

        CloseOldBrowserWindows();
    }

    private static void CloseOldBrowserWindows()
    {
        try
        {
            foreach (var name in new[] { "chrome", "msedge" })
            {
                foreach (var proc in Process.GetProcessesByName(name))
                {
                    try
                    {
                        string title = proc.MainWindowTitle;
                        if (!string.IsNullOrEmpty(title) &&
                            (title.Contains("WhatsApp-System", StringComparison.OrdinalIgnoreCase) ||
                             title.Contains("Night-System", StringComparison.OrdinalIgnoreCase) ||
                             title.Contains("NightSystem", StringComparison.OrdinalIgnoreCase)))
                        {
                            proc.Kill();
                            proc.WaitForExit(500);
                        }
                    }
                    catch { }
                }
            }
        }
        catch { }
    }

    private static void LaunchAppWindow(string url)
    {
        CloseOldBrowserWindows();
        Thread.Sleep(150);

        string appArgs = $"--app={url} --window-size=1280,820 --start-maximized";
        string[] browserPaths =
        {
            @"C:\Program Files\Google\Chrome\Application\chrome.exe",
            @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe"),
            @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            @"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Edge\Application\msedge.exe")
        };

        foreach (var b in browserPaths)
        {
            if (File.Exists(b))
            {
                try
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = b,
                        Arguments = appArgs,
                        UseShellExecute = false
                    });
                    return;
                }
                catch { }
            }
        }

        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch { }
    }
}
