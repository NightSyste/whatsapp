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
        // 1. Single Instance Protection
        using var mutex = new Mutex(true, MutexId, out bool isNewInstance);
        if (!isNewInstance)
        {
            LaunchAppWindow("http://localhost:3000");
            return;
        }

        try
        {
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string installDir = Path.Combine(appData, "NightSystem", "WhatsApp");
            string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
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

            // 3. Sicherstellen, dass die App-Dateien in AppData vorhanden sind
            if (!File.Exists(Path.Combine(installDir, "server.js")))
            {
                await InstallOrDownloadApp(installDir);
            }

            // 4. Alte Sperren aufraeumen
            CleanupLocksAndProcesses(installDir);

            // 5. Node.js Server starten
            string nodePath = FindNodeExecutable();
            var nodePsi = new ProcessStartInfo
            {
                FileName = nodePath,
                Arguments = "server.js",
                WorkingDirectory = installDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };

            Process? nodeProc = Process.Start(nodePsi);

            // 6. Warten bis Server ansprechbar ist (max 15 Sekunden)
            using (var waitHttp = new HttpClient { Timeout = TimeSpan.FromMilliseconds(500) })
            {
                for (int i = 0; i < 30; i++)
                {
                    try
                    {
                        var res = await waitHttp.GetAsync("http://localhost:3000/api/status");
                        if (res.IsSuccessStatusCode) break;
                    }
                    catch { }
                    await Task.Delay(500);
                }
            }

            // 7. Desktop-App-Fenster oeffnen
            LaunchAppWindow("http://localhost:3000");

            // 8. Launcher haelt den Prozess am Leben bis der Server beendet wird
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

    private static async Task InstallOrDownloadApp(string targetDir)
    {
        Directory.CreateDirectory(targetDir);

        // Option A: Lokale Dateien kopieren
        string localSource = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "WhatsApp");
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
    }

    private static string FindNodeExecutable()
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

        return "node";
    }

    private static void LaunchAppWindow(string url)
    {
        string appArgs = $"--app={url} --window-size=1280,820 --start-maximized";
        string[] browserPaths =
        {
            @"C:\Program Files\Google\Chrome\Application\chrome.exe",
            @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            @"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
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
