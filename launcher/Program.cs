using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace WhatsAppLauncher;

class Program
{
    private static readonly string MutexId = "NightSystem_WhatsApp_Launcher_Mutex_v1";

    static async Task Main(string[] args)
    {
        string installDir = ResolveInstallDirectory();

        // 1. Single Instance Protection
        using var mutex = new Mutex(true, MutexId, out bool isNewInstance);
        if (!isNewInstance)
        {
            OpenExistingInstance(installDir);
            return;
        }

        try
        {
            string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            if (string.IsNullOrWhiteSpace(desktopDir))
            {
                desktopDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Desktop");
            }
            string desktopExe = Path.Combine(desktopDir, "WhatsApp-System.exe");
            string currentExe = Environment.ProcessPath ?? "";

            // 2. Desktop-Platzierung: Falls die .exe von woanders gestartet wird (z.B. Downloads), auf Desktop kopieren
            if (!string.IsNullOrEmpty(currentExe) && !string.Equals(currentExe, desktopExe, StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    File.Copy(currentExe, desktopExe, true);
                }
                catch { }
            }

            // 3. Sicherstellen, dass die App-Dateien in installDir vorhanden sind
            if (!File.Exists(Path.Combine(installDir, "server.js")))
            {
                await InstallOrDownloadApp(installDir);
            }

            // 4. Alte Sperren und Ports aufraeumen
            CleanupLocksAndProcesses(installDir);

            // 5. Node.js Laufzeitumgebung ermitteln oder nachladen
            string nodePath = await EnsureNodeExecutable(installDir);

            // 6. Node.js Server starten mit random Port und ohne automatisches Browser-Popup
            var nodePsi = new ProcessStartInfo
            {
                FileName = nodePath,
                Arguments = "server.js --no-browser",
                WorkingDirectory = installDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            nodePsi.EnvironmentVariables["LAUNCHER_MANAGED"] = "1";

            Process? nodeProc = Process.Start(nodePsi);

            // 7. Warten bis Server ansprechbar ist und Port ermitteln
            string activePortFile = Path.Combine(installDir, ".active_port");
            int activePort = 0;

            using (var waitHttp = new HttpClient { Timeout = TimeSpan.FromMilliseconds(500) })
            {
                for (int i = 0; i < 60; i++)
                {
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
                            var res = await waitHttp.GetAsync($"http://127.0.0.1:{activePort}/api/ready");
                            if (res.IsSuccessStatusCode) break;
                        }
                        catch { }
                    }
                    await Task.Delay(500);
                }
            }

            // 8. Desktop-App-Fenster oeffnen
            if (activePort > 0)
            {
                LaunchAppWindow($"http://127.0.0.1:{activePort}");
            }
            else
            {
                LaunchAppWindow("http://127.0.0.1:3000");
            }

            // 9. Launcher haelt den Prozess am Leben bis der Server beendet wird
            if (nodeProc != null)
            {
                await nodeProc.WaitForExitAsync();
            }
        }
        catch (Exception ex)
        {
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
                    LaunchAppWindow($"http://127.0.0.1:{port}");
                    return;
                }
            }
            LaunchAppWindow("http://127.0.0.1:3000");
        }
        catch { }
    }

    private static async Task<string> EnsureNodeExecutable(string installDir)
    {
        // 1. Integrierte Runtime in AppData pruefen
        string runtimeNode = Path.Combine(installDir, "runtime", "node.exe");
        if (File.Exists(runtimeNode)) return runtimeNode;

        // 2. Lokales Ausfuehrungsverzeichnis pruefen
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string localRuntimeNode = Path.Combine(baseDir, "runtime", "node.exe");
        if (File.Exists(localRuntimeNode)) return localRuntimeNode;

        // 3. Systemweite Installationen pruefen
        string systemNode = FindSystemNodeExecutable();
        if (!string.IsNullOrEmpty(systemNode)) return systemNode;

        // 4. Runtime-Paket nachladen falls weder Node noch die Runtime existieren
        try
        {
            string runtimePackUrl = "https://raw.githubusercontent.com/NightSyste/dowloader/main/runtime_pack.zip";
            string tempZip = Path.Combine(Path.GetTempPath(), "night_runtime_pack_launcher.zip");

            using var client = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
            client.DefaultRequestHeaders.UserAgent.ParseAdd("NightSystem-Launcher/1.0");
            var bytes = await client.GetByteArrayAsync(runtimePackUrl);
            await File.WriteAllBytesAsync(tempZip, bytes);

            ZipFile.ExtractToDirectory(tempZip, installDir, overwriteFiles: true);
            try { File.Delete(tempZip); } catch { }

            if (File.Exists(runtimeNode)) return runtimeNode;
        }
        catch { }

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
                folderName.Equals("dist", StringComparison.OrdinalIgnoreCase))
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
            string lockPath = Path.Combine(installDir, ".wwebjs_auth", "session", "lockfile");
            if (File.Exists(lockPath))
            {
                File.Delete(lockPath);
            }
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
                            (title.Contains("WhatsApp", StringComparison.OrdinalIgnoreCase) ||
                             title.Contains("127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
                             title.Contains("localhost", StringComparison.OrdinalIgnoreCase) ||
                             title.Contains("Night-System", StringComparison.OrdinalIgnoreCase)))
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
