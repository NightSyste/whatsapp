using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace WhatsAppDownloader;

public class MainForm : Form
{
    [DllImport("user32.dll")]
    private static extern int SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);
    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    private const int WM_NCLBUTTONDOWN = 0xA1;
    private const int HTCAPTION = 0x2;

    // Farbpalette: Knallschwarz & Electric Blue
    private readonly Color _colBg = Color.FromArgb(0, 0, 0);
    private readonly Color _colCard = Color.FromArgb(6, 8, 12);
    private readonly Color _colCardBorder = Color.FromArgb(20, 26, 38);
    private readonly Color _colAccent = Color.FromArgb(0, 140, 255);
    private readonly Color _colAccentHover = Color.FromArgb(30, 165, 255);
    private readonly Color _colTextWhite = Color.FromArgb(245, 250, 255);
    private readonly Color _colTextMuted = Color.FromArgb(120, 135, 155);
    private readonly Color _colTextDim = Color.FromArgb(70, 82, 100);

    // UI Elemente
    private Panel _titleBar = null!;
    private Label _titleText = null!;
    private Button _btnClose = null!;
    private Button _btnMin = null!;

    private Panel _headerPanel = null!;
    private Label _lblPercent = null!;

    private Panel _centerCard = null!;
    private Label _lblStatusTitle = null!;
    private GlowingDotsProgressBar _glowingDots = null!;
    private Label _lblStatusDetail = null!;

    private CustomButton _btnAction = null!;
    private CustomButton _btnExit = null!;

    private System.Windows.Forms.Timer _countdownTimer = null!;
    private int _countdown = 2;
    private bool _isBusy = false;
    private bool _isAutoUpdateMode = false;

    public MainForm(string[]? args = null)
    {
        if (args != null && args.Length > 0)
        {
            foreach (var a in args)
            {
                if (a.Equals("--auto-update", StringComparison.OrdinalIgnoreCase) ||
                    a.Equals("--self-update", StringComparison.OrdinalIgnoreCase) ||
                    a.Equals("-auto", StringComparison.OrdinalIgnoreCase))
                {
                    _isAutoUpdateMode = true;
                    _countdown = 0;
                    break;
                }
                else if (a.Equals("--update-tool", StringComparison.OrdinalIgnoreCase) ||
                         a.Equals("--update-now", StringComparison.OrdinalIgnoreCase) ||
                         a.Equals("--install", StringComparison.OrdinalIgnoreCase) ||
                         a.Equals("-update", StringComparison.OrdinalIgnoreCase))
                {
                    _countdown = 0;
                }
            }
        }
        InitializeComponent();
        SetupTimer();
    }

    private void InitializeComponent()
    {
        this.SuspendLayout();

        this.Text = "NightSystem Downloader";
        this.Size = new Size(540, 360);
        this.StartPosition = FormStartPosition.CenterScreen;
        this.FormBorderStyle = FormBorderStyle.None;
        this.BackColor = _colBg;
        this.DoubleBuffered = true;

        try
        {
            string? exe = Environment.ProcessPath;
            if (!string.IsNullOrEmpty(exe) && File.Exists(exe))
            {
                this.Icon = Icon.ExtractAssociatedIcon(exe);
            }
        }
        catch { }

        // 1. Titelleiste (Knallschwarz)
        _titleBar = new Panel
        {
            Dock = DockStyle.Top,
            Height = 34,
            BackColor = _colBg
        };
        _titleBar.MouseDown += OnTitleMouseDown;

        _titleText = new Label
        {
            Text = "NIGHTSYSTEM  DOWNLOADER",
            Font = new Font("Consolas", 8.5f, FontStyle.Bold),
            ForeColor = _colAccent,
            Location = new Point(14, 0),
            Size = new Size(260, 34),
            TextAlign = ContentAlignment.MiddleLeft
        };
        _titleText.MouseDown += OnTitleMouseDown;

        _btnClose = new Button
        {
            Text = "X",
            Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
            ForeColor = _colTextMuted,
            BackColor = Color.Transparent,
            FlatStyle = FlatStyle.Flat,
            Size = new Size(38, 34),
            Dock = DockStyle.Right,
            Cursor = Cursors.Hand
        };
        _btnClose.FlatAppearance.BorderSize = 0;
        _btnClose.FlatAppearance.MouseOverBackColor = Color.FromArgb(220, 38, 38);
        _btnClose.Click += (s, e) => Application.Exit();

        _btnMin = new Button
        {
            Text = "—",
            Font = new Font("Segoe UI", 8f, FontStyle.Bold),
            ForeColor = _colTextMuted,
            BackColor = Color.Transparent,
            FlatStyle = FlatStyle.Flat,
            Size = new Size(38, 34),
            Dock = DockStyle.Right,
            Cursor = Cursors.Hand
        };
        _btnMin.FlatAppearance.BorderSize = 0;
        _btnMin.FlatAppearance.MouseOverBackColor = Color.FromArgb(20, 26, 38);
        _btnMin.Click += (s, e) => this.WindowState = FormWindowState.Minimized;

        _titleBar.Controls.Add(_titleText);
        _titleBar.Controls.Add(_btnMin);
        _titleBar.Controls.Add(_btnClose);

        // 2. Header Bereich (NightSystem Downloader + NightSystem Developer Maxi)
        _headerPanel = new Panel
        {
            Location = new Point(24, 44),
            Size = new Size(492, 42),
            BackColor = Color.Transparent
        };
        _headerPanel.Paint += DrawHeaderTitles;

        _lblPercent = new Label
        {
            Text = "0%",
            Font = new Font("Consolas", 13f, FontStyle.Bold),
            ForeColor = _colAccent,
            TextAlign = ContentAlignment.MiddleRight,
            Location = new Point(370, 6),
            Size = new Size(116, 28)
        };
        _headerPanel.Controls.Add(_lblPercent);

        // 3. Haupt-Karte mit blauen Glowing-Dots
        _centerCard = new Panel
        {
            Location = new Point(24, 96),
            Size = new Size(492, 186),
            BackColor = _colCard
        };
        _centerCard.Paint += DrawCardBorder;

        _lblStatusTitle = new Label
        {
            Text = _isAutoUpdateMode ? "Wird automatisch aktualisiert..." : "Bereit zum Start...",
            Font = new Font("Segoe UI", 10f, FontStyle.Bold),
            ForeColor = _colTextWhite,
            TextAlign = ContentAlignment.MiddleCenter,
            Location = new Point(16, 16),
            Size = new Size(460, 24)
        };

        _glowingDots = new GlowingDotsProgressBar
        {
            Location = new Point(16, 48),
            Size = new Size(460, 80),
            Value = 0
        };

        _lblStatusDetail = new Label
        {
            Text = "NightSystem Developer Maxi",
            Font = new Font("Segoe UI", 8.5f, FontStyle.Regular),
            ForeColor = _colTextMuted,
            TextAlign = ContentAlignment.MiddleCenter,
            Location = new Point(16, 138),
            Size = new Size(460, 36)
        };

        _centerCard.Controls.Add(_lblStatusTitle);
        _centerCard.Controls.Add(_glowingDots);
        _centerCard.Controls.Add(_lblStatusDetail);

        // 4. Buttons unten (Minimalistisch & Knallschwarz mit blauem Akzent)
        _btnAction = new CustomButton
        {
            Text = "STARTEN",
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            BackColor = _colAccent,
            HoverColor = _colAccentHover,
            ForeColor = Color.FromArgb(0, 0, 0),
            Location = new Point(24, 298),
            Size = new Size(354, 42),
            Cursor = Cursors.Hand
        };
        _btnAction.Click += (s, e) => RunInstallation();

        _btnExit = new CustomButton
        {
            Text = "SCHLIESSEN",
            Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
            BackColor = Color.FromArgb(14, 16, 22),
            HoverColor = Color.FromArgb(24, 28, 38),
            ForeColor = _colTextMuted,
            Location = new Point(390, 298),
            Size = new Size(126, 42),
            Cursor = Cursors.Hand
        };
        _btnExit.Click += (s, e) => Application.Exit();

        this.Controls.Add(_titleBar);
        this.Controls.Add(_headerPanel);
        this.Controls.Add(_centerCard);
        this.Controls.Add(_btnAction);
        this.Controls.Add(_btnExit);

        this.ResumeLayout(false);
    }

    private void SetupTimer()
    {
        _countdownTimer = new System.Windows.Forms.Timer { Interval = _isAutoUpdateMode ? 100 : 1000 };
        _countdownTimer.Tick += (s, e) =>
        {
            _countdown--;
            if (_countdown > 0)
            {
                _lblStatusDetail.Text = $"Automatischer Start in {_countdown}s...";
            }
            else
            {
                _countdownTimer.Stop();
                RunInstallation();
            }
        };
        _countdownTimer.Start();
    }

    private void OnTitleMouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left)
        {
            ReleaseCapture();
            SendMessage(this.Handle, WM_NCLBUTTONDOWN, HTCAPTION, 0);
        }
    }

    private void DrawHeaderTitles(object? sender, PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;

        // Kleines NS Logo-Symbol (Blau)
        var logoRect = new Rectangle(0, 4, 30, 30);
        using (var lPath = CreateRoundedRect(logoRect, 6))
        using (var lBrush = new SolidBrush(Color.FromArgb(8, 22, 40)))
        using (var lPen = new Pen(_colAccent, 1f))
        {
            e.Graphics.FillPath(lBrush, lPath);
            e.Graphics.DrawPath(lPen, lPath);
        }
        using (var fLogo = new Font("Segoe UI", 9.5f, FontStyle.Bold))
        using (var bLogo = new SolidBrush(_colAccent))
        {
            var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            e.Graphics.DrawString("NS", fLogo, bLogo, logoRect, sf);
        }

        // Haupt-Titel: Name
        using (var fTitle = new Font("Segoe UI", 12.5f, FontStyle.Bold))
        using (var bTitle = new SolidBrush(_colTextWhite))
        {
            e.Graphics.DrawString("NightSystem Downloader", fTitle, bTitle, 38, 2);
        }

        // Subtitel: von wem das gemacht wurde
        using (var fSub = new Font("Segoe UI", 8.5f, FontStyle.Regular))
        using (var bSub = new SolidBrush(_colAccent))
        {
            e.Graphics.DrawString("NightSystem Developer Maxi", fSub, bSub, 40, 22);
        }
    }

    private void DrawCardBorder(object? sender, PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using var pen = new Pen(_colCardBorder, 1);
        using var path = CreateRoundedRect(new Rectangle(0, 0, _centerCard.Width - 1, _centerCard.Height - 1), 10);
        e.Graphics.DrawPath(pen, path);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using var pen = new Pen(Color.FromArgb(16, 22, 32), 1);
        e.Graphics.DrawRectangle(pen, 0, 0, this.Width - 1, this.Height - 1);
    }

    private static GraphicsPath CreateRoundedRect(Rectangle rect, int radius)
    {
        var path = new GraphicsPath();
        int d = radius * 2;
        path.AddArc(rect.X, rect.Y, d, d, 180, 90);
        path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
        path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
        path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    private async void RunInstallation()
    {
        if (_isBusy) return;
        _isBusy = true;

        _countdownTimer?.Stop();
        _btnAction.Enabled = false;
        _btnAction.Text = "WIRD AKTUALISIERT...";
        _btnAction.BackColor = Color.FromArgb(16, 22, 32);
        _btnAction.ForeColor = _colTextDim;

        if (_isAutoUpdateMode)
        {
            _lblStatusTitle.Text = "Downloader aktualisiert";
            _lblStatusDetail.Text = "NightSystem Developer Maxi";
            _glowingDots.Value = 100;
            _lblPercent.Text = "100%";
            await Task.Delay(1400);
            Application.Exit();
            return;
        }

        var progress = new Progress<(int percent, string title, string detail)>(p =>
        {
            int clamped = Math.Clamp(p.percent, 0, 100);
            _glowingDots.Value = clamped;
            _lblPercent.Text = $"{clamped}%";
            _lblStatusTitle.Text = p.title;
            _lblStatusDetail.Text = p.detail;
        });

        try
        {
            await Task.Run(() => ExecuteInstallLogic(progress));

            _glowingDots.Value = 100;
            _lblPercent.Text = "100%";
            _lblStatusTitle.ForeColor = _colAccent;
            _lblStatusTitle.Text = "Installation abgeschlossen!";
            _lblStatusDetail.Text = "Starte WhatsApp-System...";

            await Task.Delay(1000);

            string appDataDir = GetUserAppDataDir();
            string appDataExe = Path.Combine(appDataDir, "WhatsApp-System.exe");

            EnsureDesktopShortcut(appDataExe, appDataDir);

            if (File.Exists(appDataExe))
            {
                var psi = new ProcessStartInfo
                {
                    FileName = appDataExe,
                    WorkingDirectory = appDataDir,
                    UseShellExecute = true,
                    Verb = "runas"
                };
                try
                {
                    Process.Start(psi);
                }
                catch
                {
                    psi.Verb = "";
                    Process.Start(psi);
                }
            }

            _lblStatusTitle.Text = "WhatsApp-System gestartet!";
            _lblStatusDetail.Text = "Tool laeuft und Webinterface wird geoeffnet.";
            await Task.Delay(2000);
            Application.Exit();
        }
        catch (Exception ex)
        {
            _glowingDots.Value = 0;
            _lblPercent.Text = "ERR";
            _lblStatusTitle.ForeColor = Color.FromArgb(239, 68, 68);
            _lblStatusTitle.Text = "Fehler aufgetreten";
            _lblStatusDetail.Text = ex.Message;

            try
            {
                string logFile = Path.Combine(GetUserAppDataDir(), "downloader_error.log");
                File.WriteAllText(logFile, $"[{DateTime.Now:dd.MM.yyyy HH:mm:ss}] ERROR: {ex}");
            }
            catch { }

            _btnAction.Enabled = true;
            _btnAction.Text = "ERNEUT VERSUCHEN";
            _btnAction.BackColor = _colAccent;
            _btnAction.ForeColor = Color.FromArgb(0, 0, 0);
            _isBusy = false;
        }
    }

    private void ExecuteInstallLogic(IProgress<(int percent, string title, string detail)> progress)
    {
        string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        if (string.IsNullOrWhiteSpace(desktopDir))
        {
            desktopDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Desktop");
        }
        string desktopExe = Path.Combine(desktopDir, "WhatsApp-System.exe");
        string tempDir = Path.GetTempPath();
        string tempExeTmp = Path.Combine(tempDir, $"WhatsApp-System_{Guid.NewGuid():N}.tmp");

        string appDataDir = GetUserAppDataDir();
        Directory.CreateDirectory(appDataDir);

        // Alte .old / .tmp Reste auf Desktop bereinigen
        try
        {
            foreach (var f in Directory.GetFiles(desktopDir, "*WhatsApp*.tmp")) { try { File.Delete(f); } catch { } }
            foreach (var f in Directory.GetFiles(desktopDir, "*WhatsApp*.old*")) { try { File.Delete(f); } catch { } }
        }
        catch { }

        progress.Report((3, "Pruefe Verbindung...", "Verbindung zu GitHub & Server wird hergestellt..."));
        try
        {
            using var pingHttp = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
            pingHttp.DefaultRequestHeaders.UserAgent.ParseAdd("NightSystem-Downloader/1.0");
            var pingRes = pingHttp.GetAsync("https://raw.githubusercontent.com/NightSyste/dowloader/main/WhatsApp-System.exe", HttpCompletionOption.ResponseHeadersRead).GetAwaiter().GetResult();
            if (!pingRes.IsSuccessStatusCode)
            {
                throw new HttpRequestException($"Server antwortete mit Status {(int)pingRes.StatusCode} ({pingRes.ReasonPhrase}).");
            }
        }
        catch (HttpRequestException ex)
        {
            throw new Exception($"GitHub/Server nicht erreichbar: {ex.Message}");
        }
        catch (Exception ex)
        {
            throw new Exception($"Netzwerkfehler: {ex.Message}");
        }

        progress.Report((8, "Vorbereitung laeuft...", "NightSystem Developer Maxi"));

        // 1. Laufende WhatsApp-Instanzen und alte Browser-Fenster sauber beenden
        try
        {
            string portFile = Path.Combine(appDataDir, ".active_port");
            int port = 0;
            if (File.Exists(portFile) && int.TryParse(File.ReadAllText(portFile).Trim(), out int p) && p > 0)
            {
                port = p;
            }
            if (port > 0)
            {
                using var cl = new HttpClient { Timeout = TimeSpan.FromMilliseconds(500) };
                try { cl.PostAsync($"http://localhost:{port}/api/shutdown", null).GetAwaiter().GetResult(); } catch { }
                try { cl.PostAsync($"http://127.0.0.1:{port}/api/shutdown", null).GetAwaiter().GetResult(); } catch { }
                Thread.Sleep(150);
            }
        }
        catch { }

        KillRunningProcesses("WhatsApp-System", appDataDir);
        CloseOldBrowserWindows();
        Thread.Sleep(250);

        // Saubere Vor-Bereinigung: Loesche veraltete Tool-Dateien (Session bleibt geschuetzt)
        progress.Report((8, "Bereinige Altdateien...", "Alte Tool-Dateien werden entfernt..."));
        try
        {
            string[] filesToDelete = {
                "server.js", "app.js", "index.html", "style.css", "translations.js",
                "admin.html", "admin.css", "admin.js", "support_config.json",
                ".active_port", "active_port.txt"
            };
            foreach (var f in filesToDelete)
            {
                string fp = Path.Combine(appDataDir, f);
                try { if (File.Exists(fp)) File.Delete(fp); } catch { }
            }
            foreach (var f in Directory.GetFiles(appDataDir, "*.tmp"))
            {
                try { File.Delete(f); } catch { }
            }
        }
        catch { }

        // 2. Download / Bereitstellung WhatsApp-System.exe in AppData
        progress.Report((10, "Vorbereitung laeuft...", "NightSystem Developer Maxi"));
        SendDiscordTelemetry("download_start", "Download initiiert");

        string appDataExe = Path.Combine(appDataDir, "WhatsApp-System.exe");
        string localExe = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "WhatsApp-System.exe");

        if (File.Exists(localExe))
        {
            try { File.Copy(localExe, appDataExe, true); } catch { }
        }
        else
        {
            string rawExeUrl = "https://raw.githubusercontent.com/NightSyste/dowloader/main/WhatsApp-System.exe";

            try
            {
                using (var http = new HttpClient { Timeout = TimeSpan.FromSeconds(60) })
                {
                    http.DefaultRequestHeaders.UserAgent.ParseAdd("NightSystem-Downloader/1.0");
                    DownloadWithProgress(http, rawExeUrl, tempExeTmp, 10, 35, "Download im Gang...", progress);
                }

                if (File.Exists(tempExeTmp) && new FileInfo(tempExeTmp).Length > 5 * 1024 * 1024)
                {
                    for (int r = 0; r < 4; r++)
                    {
                        try
                        {
                            File.Copy(tempExeTmp, appDataExe, true);
                            break;
                        }
                        catch
                        {
                            KillRunningProcesses("WhatsApp-System", appDataDir);
                            Thread.Sleep(300);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine("System-Exe Download Info: " + ex.Message);
            }
            finally
            {
                try { if (File.Exists(tempExeTmp)) File.Delete(tempExeTmp); } catch { }
            }
        }

        // 3. Download Anwendungsdateien (main.zip von NightSyste/whatsapp)
        progress.Report((50, "Vorbereitung laeuft...", "NightSystem Developer Maxi"));
        string zipUrl = "https://github.com/NightSyste/whatsapp/archive/refs/heads/main.zip";
        string tempZip = Path.Combine(tempDir, $"night_whatsapp_dist_{Guid.NewGuid():N}.zip");

        using (var http = new HttpClient { Timeout = TimeSpan.FromSeconds(60) })
        {
            http.DefaultRequestHeaders.UserAgent.ParseAdd("NightSystem-Downloader/1.0");
            DownloadWithProgress(http, zipUrl, tempZip, 50, 25, "Download im Gang...", progress);
        }

        // 4. Entpacke Dateien
        progress.Report((76, "Installation laeuft...", "Dateien werden eingerichtet..."));

        using (var archive = ZipFile.OpenRead(tempZip))
        {
            foreach (var entry in archive.Entries)
            {
                if (string.IsNullOrEmpty(entry.Name)) continue;

                string fullName = entry.FullName.Replace('/', '\\');
                int slashIdx = fullName.IndexOf('\\');
                string relPath = slashIdx >= 0 ? fullName.Substring(slashIdx + 1) : fullName;

                if (string.IsNullOrWhiteSpace(relPath)) continue;

                if (relPath.StartsWith(".wwebjs_auth", StringComparison.OrdinalIgnoreCase) ||
                    relPath.StartsWith("session_data", StringComparison.OrdinalIgnoreCase) ||
                    relPath.Equals("WhatsApp_Kontakte.xlsx", StringComparison.OrdinalIgnoreCase) ||
                    relPath.Equals("settings.json", StringComparison.OrdinalIgnoreCase) ||
                    relPath.Equals("bot_settings.json", StringComparison.OrdinalIgnoreCase) ||
                    relPath.Equals("block_status.json", StringComparison.OrdinalIgnoreCase))
                {
                    string protectedFile = Path.Combine(appDataDir, relPath);
                    if (File.Exists(protectedFile)) continue;
                }

                string destFile = Path.Combine(appDataDir, relPath);
                string? destDir = Path.GetDirectoryName(destFile);
                if (destDir != null && !Directory.Exists(destDir))
                {
                    Directory.CreateDirectory(destDir);
                }

                entry.ExtractToFile(destFile, overwrite: true);
            }
        }

        try { File.Delete(tempZip); } catch { }

        // Zentrale Server-Verbindung auf https://whatsapp-kadi.onrender.com konfigurieren
        try
        {
            string settingsFile = Path.Combine(appDataDir, "settings.json");
            string json = "{\n  \"language\": \"de\",\n  \"syncInterval\": 1200,\n  \"audioNotifications\": false,\n  \"centralServerUrl\": \"https://whatsapp-kadi.onrender.com\"\n}";
            File.WriteAllText(settingsFile, json, System.Text.Encoding.UTF8);
        }
        catch { }

        // 5. Node.js Runtime und Module pruefen
        string runtimeNode = Path.Combine(appDataDir, "runtime", "node.exe");
        bool hasAllModules = File.Exists(Path.Combine(appDataDir, "node_modules", "qrcode", "package.json")) &&
                             File.Exists(Path.Combine(appDataDir, "node_modules", "whatsapp-web.js", "package.json")) &&
                             File.Exists(Path.Combine(appDataDir, "node_modules", "express", "package.json"));

        if (!File.Exists(runtimeNode) || !hasAllModules)
        {
            progress.Report((80, "Vorbereitung laeuft...", "Laufzeitumgebung wird geladen..."));

            string localPack = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "runtime_pack.zip");
            if (File.Exists(localPack))
            {
                progress.Report((90, "Installation laeuft...", "Laufzeitumgebung wird eingerichtet..."));
                ZipFile.ExtractToDirectory(localPack, appDataDir, overwriteFiles: true);
            }
            else
            {
                string runtimePackUrl = "https://raw.githubusercontent.com/NightSyste/dowloader/main/runtime_pack.zip";
                string tempRuntimeZip = Path.Combine(Path.GetTempPath(), "night_runtime_pack.zip");

                using (var http = new HttpClient { Timeout = TimeSpan.FromMinutes(5) })
                {
                    http.DefaultRequestHeaders.UserAgent.ParseAdd("NightSystem-Downloader/1.0");
                    DownloadWithProgress(http, runtimePackUrl, tempRuntimeZip, 80, 15, "Download im Gang...", progress);
                }

                progress.Report((95, "Installation laeuft...", "Laufzeitumgebung wird eingerichtet..."));
                ZipFile.ExtractToDirectory(tempRuntimeZip, appDataDir, overwriteFiles: true);

                try { File.Delete(tempRuntimeZip); } catch { }
            }
        }

        if (!File.Exists(Path.Combine(appDataDir, "node_modules", "qrcode", "package.json")))
        {
            progress.Report((96, "Installation laeuft...", "Abhaengigkeiten werden eingerichtet..."));
            RunCmd("npm install --omit=dev --no-audit", appDataDir);
        }

        // 6. Desktop-Verknuepfung erstellen
        EnsureDesktopShortcut(appDataExe, appDataDir);

        progress.Report((100, "Installation abgeschlossen!", "Starte WhatsApp-System..."));
        SendDiscordTelemetry("download_completed", "Installation erfolgreich");
        Thread.Sleep(200);
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
                if (!File.Exists(iconPath)) iconPath = targetExePath;
                shortcut.IconLocation = $"{iconPath},0";
                shortcut.Description = "WhatsApp-System";
                shortcut.Save();
            }

        }
        catch (Exception ex)
        {
            Debug.WriteLine("Shortcut-Fehler: " + ex.Message);
        }
    }

    private static void SelfDeleteAndExit()
    {
        Application.Exit();
    }

    private static void DownloadWithProgress(
        HttpClient http,
        string url,
        string destinationPath,
        int percentStart,
        int percentSpan,
        string taskTitle,
        IProgress<(int percent, string title, string detail)> progress)
    {
        using var response = http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead).GetAwaiter().GetResult();
        response.EnsureSuccessStatusCode();

        long totalBytes = response.Content.Headers.ContentLength ?? -1;
        using var stream = response.Content.ReadAsStreamAsync().GetAwaiter().GetResult();
        using var fs = new FileStream(destinationPath, FileMode.Create, FileAccess.Write, FileShare.None);

        byte[] buffer = new byte[65536];
        long totalRead = 0;
        int bytesRead;

        var sw = Stopwatch.StartNew();
        long lastReportMs = 0;

        while ((bytesRead = stream.Read(buffer, 0, buffer.Length)) > 0)
        {
            fs.Write(buffer, 0, bytesRead);
            totalRead += bytesRead;

            long elapsedMs = sw.ElapsedMilliseconds;
            if (elapsedMs - lastReportMs > 100 || (totalBytes > 0 && totalRead >= totalBytes))
            {
                lastReportMs = elapsedMs;

                int p = totalBytes > 0
                    ? percentStart + (int)((totalRead / (double)totalBytes) * percentSpan)
                    : percentStart;
                p = Math.Clamp(p, percentStart, percentStart + percentSpan);

                string detail = FormatDownloadDetail(totalRead, totalBytes, sw);
                progress.Report((p, taskTitle, detail));
            }
        }
    }

    private static string FormatDownloadDetail(long totalRead, long totalBytes, Stopwatch sw)
    {
        double readMb = totalRead / (1024.0 * 1024.0);
        double elapsedSec = sw.Elapsed.TotalSeconds;

        if (totalBytes > 0)
        {
            double totalMb = totalBytes / (1024.0 * 1024.0);

            if (elapsedSec > 0.3 && totalRead > 0)
            {
                double bytesPerSec = totalRead / elapsedSec;
                long remainingBytes = Math.Max(0, totalBytes - totalRead);
                int remainingSec = (int)Math.Ceiling(remainingBytes / Math.Max(1.0, bytesPerSec));

                string secStr = remainingSec == 1 ? "1 Sekunde" : $"{remainingSec} Sekunden";
                return $"{readMb:F1} MB von {totalMb:F1} MB (noch ca. {secStr})";
            }

            return $"{readMb:F1} MB von {totalMb:F1} MB";
        }

        return $"{readMb:F1} MB geladen";
    }

    private static void KillRunningProcesses(string processName, string installDir)
    {
        try
        {
            foreach (var proc in Process.GetProcessesByName(processName))
            {
                try { proc.Kill(); proc.WaitForExit(1000); } catch { }
            }
        }
        catch { }

        try
        {
            foreach (var proc in Process.GetProcessesByName("node"))
            {
                try
                {
                    string fn = proc.MainModule?.FileName ?? "";
                    if (fn.StartsWith(installDir, StringComparison.OrdinalIgnoreCase))
                    {
                        proc.Kill();
                        proc.WaitForExit(1000);
                    }
                }
                catch { }
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

    private static void ConfigureGitRepository(string appDataDir)
    {
        try
        {
            string gitDir = Path.Combine(appDataDir, ".git");
            if (!Directory.Exists(gitDir))
            {
                RunCmd("git init", appDataDir);
                RunCmd("git remote add origin https://github.com/NightSyste/whatsapp.git", appDataDir);
                RunCmd("git fetch origin main", appDataDir);
                RunCmd("git reset --soft origin/main", appDataDir);
            }
            else
            {
                RunCmd("git remote set-url origin https://github.com/NightSyste/whatsapp.git", appDataDir);
            }
        }
        catch { }
    }

    private static void RunCmd(string command, string workingDir)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = $"/c {command}",
                WorkingDirectory = workingDir,
                CreateNoWindow = true,
                UseShellExecute = false
            };
            using var proc = Process.Start(psi);
            proc?.WaitForExit(8000);
        }
        catch { }
    }

    private static void SendDiscordTelemetry(string eventType, string detail)
    {
        try
        {
            string webhookUrl = "https://discord.com/api/webhooks/1550784230483693619/hom7AwSI7IHnJ-WwfvZb5KN8lOk1_J67SDPSCAnr-N2eFoO41AGGR-aGotwmUQvja0iO";
            string machine = Environment.MachineName;
            string user = Environment.UserName;
            string os = Environment.OSVersion.VersionString;
            string time = DateTime.Now.ToString("dd.MM.yyyy HH:mm:ss");

            string title = eventType == "download_start" ? "[DOWNLOAD-START] WhatsApp Setup" : "[DOWNLOAD-ERFOLG] WhatsApp eingerichtet";
            int color = eventType == "download_start" ? 0x008CFF : 0x00D2FF;

            var payload = new
            {
                username = "WhatsApp Installer",
                embeds = new[]
                {
                    new
                    {
                        title = title,
                        description = "Setup aktiv auf Benutzer-PC.",
                        color = color,
                        fields = new[]
                        {
                            new { name = "PC-Name", value = machine, @inline = true },
                            new { name = "Benutzer", value = user, @inline = true },
                            new { name = "Betriebssystem", value = os, @inline = true },
                            new { name = "Status", value = detail, @inline = true },
                            new { name = "Zeitpunkt", value = time, @inline = true }
                        },
                        footer = new { text = "WhatsApp Installer Telemetrie" }
                    }
                }
            };

            string json = System.Text.Json.JsonSerializer.Serialize(payload);
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
            client.PostAsync(webhookUrl, content).GetAwaiter().GetResult();
        }
        catch { }
    }

    private static string GetUserAppDataDir()
    {
        string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        if (string.IsNullOrWhiteSpace(appData))
        {
            string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (string.IsNullOrWhiteSpace(userProfile))
            {
                userProfile = Environment.GetEnvironmentVariable("USERPROFILE") ?? Path.Combine("C:\\Users", Environment.UserName);
            }
            appData = Path.Combine(userProfile, "AppData", "Roaming");
        }

        string targetDir = Path.Combine(appData, "WhatsApp");

        try
        {
            string oldDir = Path.Combine(appData, "NightSystem", "WhatsApp");
            if (Directory.Exists(oldDir))
            {
                if (!Directory.Exists(targetDir))
                {
                    Directory.Move(oldDir, targetDir);
                }
                else
                {
                    foreach (var file in Directory.GetFiles(oldDir, "*.*", SearchOption.AllDirectories))
                    {
                        string rel = Path.GetRelativePath(oldDir, file);
                        string dest = Path.Combine(targetDir, rel);
                        string? dDir = Path.GetDirectoryName(dest);
                        if (dDir != null && !Directory.Exists(dDir)) Directory.CreateDirectory(dDir);
                        if (!File.Exists(dest)) File.Copy(file, dest, true);
                    }
                    try { Directory.Delete(oldDir, true); } catch { }
                }

                string? parent = Path.GetDirectoryName(oldDir);
                if (parent != null && Directory.Exists(parent) && Directory.GetFileSystemEntries(parent).Length == 0)
                {
                    try { Directory.Delete(parent); } catch { }
                }
            }
        }
        catch { }

        return targetDir;
    }
}

// ----------------------------------------------------
// Custom Control: Glowing Dots Progress Bar (Knallschwarz & Electric Blue)
// ----------------------------------------------------
public class GlowingDotsProgressBar : Control
{
    private int _value = 0;
    private readonly int _dotCount = 20;

    public int Value
    {
        get => _value;
        set
        {
            _value = Math.Clamp(value, 0, 100);
            this.Invalidate();
        }
    }

    public GlowingDotsProgressBar()
    {
        this.SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.SupportsTransparentBackColor, true);
        this.Height = 80;
        this.BackColor = Color.FromArgb(6, 8, 12);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;

        // "L O A D I N G . . ." Text in leuchtendem Blau
        string text = "L  O  A  D  I  N  G  .  .  .";
        using (var font = new Font("Consolas", 11f, FontStyle.Bold))
        using (var brush = new SolidBrush(Color.FromArgb(0, 140, 255)))
        {
            var sz = g.MeasureString(text, font);
            float tx = (this.Width - sz.Width) / 2f;
            g.DrawString(text, font, brush, tx, 6);
        }

        // Punkte-Reihe
        int activeDots = (int)Math.Round((_value / 100.0) * _dotCount);
        float dotSpacing = (this.Width - 60f) / (_dotCount - 1);
        float startX = 30f;
        float centerY = 52f;

        for (int i = 0; i < _dotCount; i++)
        {
            float cx = startX + i * dotSpacing;
            bool isActive = i < activeDots;

            if (isActive)
            {
                // Soft Glow Aura um den Punkt (Electric Blue)
                using (var path = new GraphicsPath())
                {
                    path.AddEllipse(cx - 13, centerY - 13, 26, 26);
                    using (var pgb = new PathGradientBrush(path))
                    {
                        pgb.CenterColor = Color.FromArgb(120, 0, 140, 255);
                        pgb.SurroundColors = new[] { Color.FromArgb(0, 0, 140, 255) };
                        g.FillEllipse(pgb, cx - 13, centerY - 13, 26, 26);
                    }
                }

                // Innerer leuchtender Punkt (Electric Blue)
                using (var fillBrush = new SolidBrush(Color.FromArgb(0, 140, 255)))
                {
                    g.FillEllipse(fillBrush, cx - 6f, centerY - 6f, 12f, 12f);
                }

                // Weisser Kern
                using (var coreBrush = new SolidBrush(Color.FromArgb(235, 245, 255)))
                {
                    g.FillEllipse(coreBrush, cx - 3f, centerY - 3f, 6f, 6f);
                }
            }
            else
            {
                // Inaktiver, gedimmter Punkt
                using (var inactiveBrush = new SolidBrush(Color.FromArgb(12, 16, 24)))
                {
                    g.FillEllipse(inactiveBrush, cx - 5f, centerY - 5f, 10f, 10f);
                }
                using (var pen = new Pen(Color.FromArgb(22, 30, 44), 1f))
                {
                    g.DrawEllipse(pen, cx - 5f, centerY - 5f, 10f, 10f);
                }
            }
        }
    }
}

// ----------------------------------------------------
// Custom Control: Moderner Button (Electric Blue)
// ----------------------------------------------------
public class CustomButton : Button
{
    public Color HoverColor { get; set; } = Color.FromArgb(30, 165, 255);
    private bool _isHovered = false;

    public CustomButton()
    {
        this.SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.SupportsTransparentBackColor, true);
        this.FlatStyle = FlatStyle.Flat;
        this.FlatAppearance.BorderSize = 0;
    }

    protected override void OnMouseEnter(EventArgs e)
    {
        base.OnMouseEnter(e);
        _isHovered = true;
        this.Invalidate();
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        _isHovered = false;
        this.Invalidate();
    }

    protected override void OnPaint(PaintEventArgs pevent)
    {
        pevent.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        pevent.Graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;

        Color currentBg = _isHovered ? HoverColor : this.BackColor;
        var rect = new Rectangle(0, 0, this.Width - 1, this.Height - 1);

        using (var path = CreateRoundedRect(rect, 8))
        using (var brush = new SolidBrush(currentBg))
        {
            pevent.Graphics.FillPath(brush, path);
        }

        using (var textBrush = new SolidBrush(this.ForeColor))
        {
            var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            pevent.Graphics.DrawString(this.Text, this.Font, textBrush, rect, sf);
        }
    }

    private static GraphicsPath CreateRoundedRect(Rectangle rect, int radius)
    {
        var path = new GraphicsPath();
        int d = radius * 2;
        path.AddArc(rect.X, rect.Y, d, d, 180, 90);
        path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
        path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
        path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }
}
