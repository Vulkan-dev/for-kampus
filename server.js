const express = require('express');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ImageRun,
  PageBreak
} = require('docx');

const app = express();
const PORT = process.env.PORT || 3000;

// Prevent browser from caching stale assets during updates
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// Body parser with 50mb limit for PDF/Word uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0
}));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Import endpoint for PDF, DOCX, and CSV files
app.post('/api/import/file', async (req, res) => {
  try {
    const { filename, fileBase64 } = req.body;
    if (!filename || !fileBase64) {
      return res.status(400).json({ error: 'Filename and fileBase64 data are required' });
    }

    const ext = path.extname(filename).toLowerCase();
    if (!['.pdf', '.docx', '.csv', '.txt'].includes(ext)) {
      return res.status(400).json({ error: 'Unsupported file type. Please upload a .pdf, .docx, or .csv file.' });
    }

    const tempFilePath = path.join(__dirname, `temp_upload_${Date.now()}${ext}`);
    const buffer = Buffer.from(fileBase64, 'base64');
    fs.writeFileSync(tempFilePath, buffer);

    if (ext === '.csv' || ext === '.txt') {
      const text = buffer.toString('utf-8');
      fs.unlinkSync(tempFilePath);
      return res.json({ type: 'csv', rawText: text });
    }

    // Call parse_file.py for PDF and DOCX
    const pythonScript = path.join(__dirname, 'parse_file.py');
    execFile('python', [pythonScript, tempFilePath], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }

      if (err) {
        console.error('Python parse error:', err, stderr);
        return res.status(500).json({ error: 'Failed to parse file', details: stderr || err.message });
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        if (parsed.error) {
          return res.status(400).json({ error: parsed.error });
        }
        res.json({ type: ext.replace('.', ''), ...parsed });
      } catch (jsonErr) {
        console.error('JSON parse error on python output:', stdout);
        res.status(500).json({ error: 'Invalid response from parser' });
      }
    });
  } catch (error) {
    console.error('File import error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export to Microsoft Word (.docx) endpoint
app.post('/api/export/docx', async (req, res) => {
  try {
    const { invoices, occupier, location, ntn } = req.body;

    if (!Array.isArray(invoices) || invoices.length === 0) {
      return res.status(400).json({ error: 'No invoices provided' });
    }

    const megaMallLogoPath = path.join(__dirname, 'public', 'assets', 'mega-mall-logo.png');
    const kampusLogoPath = path.join(__dirname, 'public', 'assets', 'kampus-logo.png');

    const megaMallLogoBytes = fs.existsSync(megaMallLogoPath) ? fs.readFileSync(megaMallLogoPath) : null;
    const kampusLogoBytes = fs.existsSync(kampusLogoPath) ? fs.readFileSync(kampusLogoPath) : null;

    const solidBorder = {
      style: BorderStyle.SINGLE,
      size: 10,
      color: '000000'
    };

    const cellBorders = {
      top: solidBorder,
      bottom: solidBorder,
      left: solidBorder,
      right: solidBorder
    };

    const emptyBorder = {
      style: BorderStyle.NONE,
      size: 0,
      color: 'auto'
    };

    const noBorders = {
      top: emptyBorder,
      bottom: emptyBorder,
      left: emptyBorder,
      right: emptyBorder
    };

    const children = [];

    invoices.forEach((inv, index) => {
      // 1. Header Table (Exact PDF Logo Scale: Mega Mall ~128x106, Kampus ~70x108)
      const headerRowCells = [
        new TableCell({
          width: { size: 26, type: WidthType.PERCENTAGE },
          borders: noBorders,
          alignment: AlignmentType.CENTER,
          children: [
            megaMallLogoBytes
              ? new Paragraph({
                  alignment: AlignmentType.LEFT,
                  children: [
                    new ImageRun({
                      data: megaMallLogoBytes,
                      transformation: { width: 128, height: 106 }
                    })
                  ]
                })
              : new Paragraph({ text: "MEGA MALL", alignment: AlignmentType.LEFT })
          ]
        }),
        new TableCell({
          width: { size: 48, type: WidthType.PERCENTAGE },
          borders: noBorders,
          alignment: AlignmentType.CENTER,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 80 },
              children: [
                new TextRun({
                  text: "THE MEGA MALL",
                  bold: true,
                  size: 28,
                  font: "Arial"
                })
              ]
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: "Official Billing Invoice / Reimburstment Note",
                  bold: true,
                  size: 20,
                  font: "Arial"
                })
              ]
            })
          ]
        }),
        new TableCell({
          width: { size: 26, type: WidthType.PERCENTAGE },
          borders: noBorders,
          alignment: AlignmentType.RIGHT,
          children: [
            kampusLogoBytes
              ? new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new ImageRun({
                      data: kampusLogoBytes,
                      transformation: { width: 70, height: 108 }
                    })
                  ]
                })
              : new Paragraph({ text: "KAMPUS", alignment: AlignmentType.RIGHT })
          ]
        })
      ];

      const headerTable = new Table({
        rows: [new TableRow({ children: headerRowCells })],
        width: { size: 100, type: WidthType.PERCENTAGE }
      });

      children.push(headerTable);
      children.push(new Paragraph({ spacing: { after: 200 } }));

      // 2. Customer & Invoice Info Table
      const metaTable = new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 65, type: WidthType.PERCENTAGE },
                borders: noBorders,
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: "Customer", bold: true, size: 20, font: "Arial" })],
                    spacing: { after: 60 }
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: "Legal Occupier: ", bold: true, size: 18, font: "Arial" }),
                      new TextRun({ text: occupier || "FALAKNAZ SPRINGS,", size: 18, font: "Arial" })
                    ],
                    spacing: { after: 40 }
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: "Location: ", bold: true, size: 18, font: "Arial" }),
                      new TextRun({ text: location || "The Mega Mall, Block-18, Gulishtan-e-Jauhar, Karachi.,", size: 18, font: "Arial" })
                    ],
                    spacing: { after: 40 }
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: "Billing Month: ", bold: true, size: 18, font: "Segoe UI" }),
                      new TextRun({ text: inv.billingPeriod, bold: true, size: 18, font: "Segoe UI" })
                    ]
                  })
                ]
              }),
              new TableCell({
                width: { size: 35, type: WidthType.PERCENTAGE },
                borders: noBorders,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: "Invoice,", bold: true, size: 20, font: "Segoe UI" })],
                    spacing: { after: 60 }
                  }),
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: inv.invoiceNumber, bold: true, size: 19, font: "Segoe UI" })],
                    spacing: { after: 40 }
                  }),
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                      new TextRun({ text: "NTN: ", size: 18, font: "Segoe UI" }),
                      new TextRun({ text: ntn || "C951537", bold: true, size: 18, font: "Segoe UI" })
                    ]
                  })
                ]
              })
            ]
          })
        ],
        width: { size: 100, type: WidthType.PERCENTAGE }
      });

      children.push(metaTable);
      children.push(new Paragraph({ spacing: { after: 260 } }));

      // 3. Billing Table
      const thStyle = {
        borders: cellBorders,
        alignment: AlignmentType.CENTER
      };

      const billTable = new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({
                ...thStyle,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "CONSUMPTION GALLON", bold: true, size: 15, font: "Segoe UI", color: "555555" })] })]
              }),
              new TableCell({
                ...thStyle,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "RATE PER GALLON", bold: true, size: 15, font: "Segoe UI", color: "555555" })] })]
              }),
              new TableCell({
                ...thStyle,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "BILL AMOUNT", bold: true, size: 15, font: "Segoe UI", color: "555555" })] })]
              }),
              new TableCell({
                ...thStyle,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "PREVIOUS", bold: true, size: 15, font: "Segoe UI", color: "555555" })] })]
              }),
              new TableCell({
                ...thStyle,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "TOTAL PAYABLE", bold: true, size: 15, font: "Segoe UI", color: "555555" })] })]
              })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: Number(inv.gallons).toLocaleString(), size: 18, font: "Segoe UI" })] })]
              }),
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: Number(inv.rate).toFixed(2), size: 18, font: "Segoe UI" })] })]
              }),
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${Number(inv.billAmount).toLocaleString()}/-`, size: 18, font: "Segoe UI" })] })]
              }),
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: inv.previous === 0 ? "0" : `${Number(inv.previous).toLocaleString()}/-`, size: 18, font: "Segoe UI" })] })]
              }),
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${Number(inv.totalPayable).toLocaleString()}/-`, size: 18, font: "Segoe UI" })] })]
              })
            ]
          })
        ],
        width: { size: 100, type: WidthType.PERCENTAGE }
      });

      children.push(billTable);
      children.push(new Paragraph({ spacing: { after: 320 } }));

      // 4. Bullet Notices
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "• *Please make payment in favour of Kampus Integrated Services NTN: C951537 Account No: 10380109491064 in Meezan Bank.", size: 17, font: "Segoe UI" })
          ],
          spacing: { after: 120 }
        })
      );
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "• *If the payment is not received till the last payment date, ", size: 17, font: "Segoe UI" }),
            new TextRun({ text: "\"The Mega Mall\"", bold: true, size: 17, font: "Segoe UI" }),
            new TextRun({ text: " will hold the services of your lincensed area and will not held responsible for any losses Whats so ever there for.", size: 17, font: "Segoe UI" })
          ],
          spacing: { after: 450 }
        })
      );

      // 5. Signoff
      children.push(
        new Paragraph({
          children: [new TextRun({ text: "Account Department", bold: true, size: 18, font: "Arial" })],
          spacing: { after: 50 }
        })
      );
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `Date : ${inv.issueDate}`, bold: true, size: 18, font: "Arial" })],
          spacing: { after: 1200 }
        })
      );

      // 6. Footer Address
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "4 Floor, Mega Mall, Block-18, Gulishtan-E-Jauhar, Karachi.",
              bold: true,
              size: 17,
              font: "Arial"
            })
          ]
        })
      );

      if (index < invoices.length - 1) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }
    });

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 1080, right: 1080 }
          }
        },
        children
      }]
    });

    const buffer = await Packer.toBuffer(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="Water_Invoices.docx"');
    res.send(buffer);
  } catch (error) {
    console.error('Word export error:', error);
    res.status(500).json({ error: 'Failed to generate Word document', details: error.message });
  }
});

// ----------------------------------------------------
// Shops Directory & Identifier Endpoints
// ----------------------------------------------------
const SHOPS_JSON_PATH = path.join(__dirname, 'public', 'data', 'shops.json');

app.get('/api/shops', (req, res) => {
  try {
    if (!fs.existsSync(SHOPS_JSON_PATH)) {
      return res.json([]);
    }
    const data = fs.readFileSync(SHOPS_JSON_PATH, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Failed to read shops.json:', error);
    res.status(500).json({ error: 'Failed to read shops directory' });
  }
});

app.post('/api/shops', (req, res) => {
  try {
    const { shops } = req.body;
    if (!Array.isArray(shops)) {
      return res.status(400).json({ error: 'Shops array required' });
    }
    fs.writeFileSync(SHOPS_JSON_PATH, JSON.stringify(shops, null, 2), 'utf-8');
    res.json({ success: true, count: shops.length });
  } catch (error) {
    console.error('Failed to save shops:', error);
    res.status(500).json({ error: 'Failed to save shops directory' });
  }
});

app.post('/api/shops/export/xlsx', (req, res) => {
  try {
    const { shops } = req.body;
    const shopsData = Array.isArray(shops) && shops.length > 0
      ? shops
      : (fs.existsSync(SHOPS_JSON_PATH) ? JSON.parse(fs.readFileSync(SHOPS_JSON_PATH, 'utf-8')) : []);

    const tempJsonPath = path.join(__dirname, `temp_shops_${Date.now()}.json`);
    const tempXlsxPath = path.join(__dirname, `temp_shops_${Date.now()}.xlsx`);

    fs.writeFileSync(tempJsonPath, JSON.stringify(shopsData, null, 2), 'utf-8');

    const pythonScript = path.join(__dirname, 'export_shops_xlsx.py');
    execFile('python', [pythonScript, tempJsonPath, tempXlsxPath], (err, stdout, stderr) => {
      if (fs.existsSync(tempJsonPath)) fs.unlinkSync(tempJsonPath);

      if (err || !fs.existsSync(tempXlsxPath)) {
        console.error('XLSX export error:', err, stderr);
        if (fs.existsSync(tempXlsxPath)) fs.unlinkSync(tempXlsxPath);
        return res.status(500).json({ error: 'Failed to generate Excel file' });
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="Mega_Mall_Shops_Directory.xlsx"');
      const fileStream = fs.createReadStream(tempXlsxPath);
      fileStream.pipe(res);
      fileStream.on('close', () => {
        if (fs.existsSync(tempXlsxPath)) fs.unlinkSync(tempXlsxPath);
      });
    });
  } catch (error) {
    console.error('Export xlsx error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
