"use client";

import { useState, useRef } from "react";
import { X, UploadCloud, FileSpreadsheet, Download, CheckCircle2, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { encodeStudentEmail, cleanPhoneNumber } from "@/lib/studentContact";

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultAcademicYear?: string | null;
  onSuccess: () => void;
}

interface ParsedStudentRow {
  student_roll: string;
  full_name: string;
  academic_year: string;
  email?: string;
  parent_phone?: string;
  valid: boolean;
  error?: string;
}

export function BulkImportModal({
  isOpen,
  onClose,
  defaultAcademicYear,
  onSuccess,
}: BulkImportModalProps) {
  const [selectedYear, setSelectedYear] = useState<string>(defaultAcademicYear || "1st Year");
  const [selectedBatch, setSelectedBatch] = useState<string>("All");
  const [useFileYear, setUseFileYear] = useState<boolean>(!defaultAcademicYear);
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedStudentRow[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const resetState = () => {
    setFile(null);
    setParsedData([]);
    setIsProcessingFile(false);
    setIsImporting(false);
    setImportProgress(0);
    setImportStatus("idle");
    setStatusMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setIsProcessingFile(true);
    setImportStatus("idle");
    setStatusMessage("");

    try {
      const buffer = await uploadedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      if (rawRows.length === 0) {
        setImportStatus("error");
        setStatusMessage("The uploaded file contains no data rows.");
        setIsProcessingFile(false);
        return;
      }

      // Auto-detect column headers
      const firstRow = rawRows[0];
      const keys = Object.keys(firstRow);

      const rollKey = keys.find(k => /roll|id|reg|number/i.test(k)) || keys[0];
      const nameKey = keys.find(k => /name|student|full/i.test(k)) || (keys.length > 1 ? keys[1] : "");
      const yearKey = keys.find(k => /year|academic|cohort|grade/i.test(k));
      const batchKey = keys.find(k => /batch|section|group|division|sec/i.test(k));
      const emailKey = keys.find(k => /email|mail/i.test(k));
      const phoneKey = keys.find(k => /phone|parent|guardian|mobile|whatsapp|contact/i.test(k));

      const parsed: ParsedStudentRow[] = rawRows.map((row) => {
        const roll = String(row[rollKey] || "").trim();
        const name = String(row[nameKey] || "").trim();
        let year = selectedYear;

        if (yearKey && row[yearKey]) {
          const rawYear = String(row[yearKey]).trim();
          if (/1|first/i.test(rawYear)) year = "1st Year";
          else if (/2|second/i.test(rawYear)) year = "2nd Year";
          else if (/3|third/i.test(rawYear)) year = "3rd Year";
          else if (/4|fourth/i.test(rawYear)) year = "4th Year";
          else year = rawYear;
        }

        let batch = selectedBatch;
        if (batchKey && row[batchKey]) {
          const rawBatch = String(row[batchKey]).trim();
          if (/a\b|batch a/i.test(rawBatch)) batch = "Batch A";
          else if (/b\b|batch b/i.test(rawBatch)) batch = "Batch B";
          else if (/c\b|batch c/i.test(rawBatch)) batch = "Batch C";
          else if (/d\b|batch d/i.test(rawBatch)) batch = "Batch D";
          else if (rawBatch) batch = rawBatch;
        }

        const finalYear = batch && batch !== "All" && !year.includes("(")
          ? `${year} (${batch})`
          : year;

        const rawPhone = phoneKey && row[phoneKey] ? String(row[phoneKey]).trim() : undefined;
        const parentPhone = rawPhone ? cleanPhoneNumber(rawPhone) : undefined;

        const valid = roll.length > 0 && name.length > 0;
        let error = "";
        if (!roll) error = "Missing Roll";
        else if (!name) error = "Missing Name";

        return {
          student_roll: roll,
          full_name: name,
          academic_year: finalYear,
          email: emailKey && row[emailKey] ? String(row[emailKey]).trim() : undefined,
          parent_phone: parentPhone,
          valid,
          error,
        };
      })
      .filter(r => r.student_roll || r.full_name) // Filter out totally blank rows
      .sort((a, b) => (a.student_roll || '').localeCompare(b.student_roll || '', undefined, { numeric: true, sensitivity: 'base' }));

      setParsedData(parsed);
    } catch (err: any) {
      console.error("Error reading file:", err);
      setImportStatus("error");
      setStatusMessage("Failed to parse the file. Please ensure it is a valid .xlsx, .xls, or .csv file.");
    } finally {
      setIsProcessingFile(false);
    }
  };

  const downloadSampleTemplate = () => {
    const sampleData = [
      {
        "Roll Number": "26001",
        "Full Name": "MORSALIM MONDAL",
        "Academic Year": selectedYear || "1st Year",
        "Batch": "Batch A",
        "Parent WhatsApp": "+919876543210",
      },
      {
        "Roll Number": "26101",
        "Full Name": "SK SAIFUDDIN",
        "Academic Year": selectedYear || "1st Year",
        "Batch": "Batch B",
        "Parent WhatsApp": "+919876543211",
      },
      {
        "Roll Number": "26201",
        "Full Name": "RAHUL ROY",
        "Academic Year": selectedYear || "1st Year",
        "Batch": "Batch C",
        "Parent WhatsApp": "+919876543212",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Students");
    XLSX.writeFile(workbook, "student_import_template.xlsx");
  };

  const handleImportSubmit = async () => {
    const validStudents = parsedData.filter(p => p.valid);
    if (validStudents.length === 0) {
      setImportStatus("error");
      setStatusMessage("No valid student rows to import.");
      return;
    }

    setIsImporting(true);
    setImportStatus("idle");
    setImportProgress(10);

    try {
      // 1. Fetch existing students by roll to prevent duplicate errors and preserve existing face_encoding
      const { data: existingStudents, error: fetchErr } = await supabase
        .from("students")
        .select("id, student_roll, face_encoding");

      if (fetchErr) throw fetchErr;

      const existingMap = new Map<string, any>();
      (existingStudents || []).forEach(s => {
        if (s.student_roll) existingMap.set(s.student_roll.toLowerCase().trim(), s);
      });

      const toInsert: any[] = [];
      const toUpdate: any[] = [];

      validStudents.forEach((student) => {
        const cleanRoll = student.student_roll.trim();
        const cleanKey = cleanRoll.toLowerCase();
        const generatedEmail = encodeStudentEmail(cleanRoll, student.parent_phone);
        const academicYear = useFileYear ? student.academic_year : selectedYear;

        if (existingMap.has(cleanKey)) {
          const existing = existingMap.get(cleanKey);
          toUpdate.push({
            id: existing.id,
            student_roll: cleanRoll,
            full_name: student.full_name,
            email: generatedEmail,
            academic_year: academicYear,
          });
        } else {
          toInsert.push({
            student_roll: cleanRoll,
            full_name: student.full_name,
            email: generatedEmail,
            academic_year: academicYear,
            face_encoding: null,
          });
        }
      });

      setImportProgress(40);

      // 2. Perform batch insert
      if (toInsert.length > 0) {
        // Chunk inserts by 50 to avoid payload limits
        const chunkSize = 50;
        for (let i = 0; i < toInsert.length; i += chunkSize) {
          const chunk = toInsert.slice(i, i + chunkSize);
          const { error: insertErr } = await supabase.from("students").insert(chunk);
          if (insertErr) throw insertErr;
          setImportProgress(Math.min(85, 40 + Math.round(((i + chunkSize) / toInsert.length) * 45)));
        }
      }

      // 3. Perform updates for existing students
      if (toUpdate.length > 0) {
        for (const updateItem of toUpdate) {
          await supabase
            .from("students")
            .update({
              full_name: updateItem.full_name,
              email: updateItem.email,
              academic_year: updateItem.academic_year,
            })
            .eq("id", updateItem.id);
        }
      }

      setImportProgress(100);
      setImportStatus("success");
      setStatusMessage(
        `Successfully imported ${validStudents.length} students (${toInsert.length} new enrolled, ${toUpdate.length} updated). You can now setup their Face IDs anytime!`
      );

      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 2000);
    } catch (err: any) {
      console.error("Error during bulk import:", err);
      setImportStatus("error");
      setStatusMessage(err.message || "Failed to import students. Please check your network and try again.");
    } finally {
      setIsImporting(false);
    }
  };

  const validCount = parsedData.filter(p => p.valid).length;
  const invalidCount = parsedData.length - validCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
              <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                Bulk Import Students
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Upload Excel (.xlsx, .xls) or CSV file with names and roll numbers
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {/* Top Options: Academic Year selection & Sample download */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200/60 dark:border-gray-700/60">
            <div className="flex items-center space-x-2">
              <label htmlFor="year-select" className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Target Year:
              </label>
              <select
                id="year-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="text-xs font-medium bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year">4th Year</option>
              </select>
            </div>

            <button
              onClick={downloadSampleTemplate}
              className="inline-flex items-center text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download Sample Excel
            </button>
          </div>

          {/* Upload Dropzone */}
          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer bg-gray-50/50 dark:bg-gray-800/20 hover:bg-indigo-50/20 dark:hover:bg-indigo-900/10 transition-all group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-inner">
                <UploadCloud className="w-7 h-7" />
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Click to browse or drag & drop Excel / CSV
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Supports columns: <span className="font-mono font-medium text-gray-700 dark:text-gray-300">Roll Number, Full Name, Academic Year</span>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Selected File Summary */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/50">
                <div className="flex items-center space-x-3 truncate">
                  <FileSpreadsheet className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <div className="truncate">
                    <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{file.name}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      {(file.size / 1024).toFixed(1)} KB • {parsedData.length} records parsed
                    </p>
                  </div>
                </div>
                <button
                  onClick={resetState}
                  disabled={isImporting}
                  className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 hover:underline px-2 py-1"
                >
                  Change File
                </button>
              </div>

              {/* Status & Stats */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-300 font-medium">
                  Ready to import: <span className="text-emerald-600 dark:text-emerald-400 font-bold">{validCount} valid</span>
                  {invalidCount > 0 && (
                    <span className="text-amber-600 dark:text-amber-400 ml-2">({invalidCount} invalid/skipped)</span>
                  )}
                </span>
                <span className="text-gray-400 text-[11px]">Previewing top records</span>
              </div>

              {/* Preview Table */}
              <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                <table className="w-full text-left text-xs divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-800/60 sticky top-0 font-semibold text-gray-700 dark:text-gray-300">
                    <tr>
                      <th className="py-2.5 px-3">Roll Number</th>
                      <th className="py-2.5 px-3">Full Name</th>
                      <th className="py-2.5 px-3">Year</th>
                      <th className="py-2.5 px-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50 bg-white dark:bg-gray-900">
                    {parsedData.slice(0, 50).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                        <td className="py-2 px-3 font-mono font-medium text-gray-900 dark:text-gray-100">
                          {row.student_roll || <span className="text-red-500 italic">Empty</span>}
                        </td>
                        <td className="py-2 px-3 text-gray-800 dark:text-gray-200">
                          {row.full_name || <span className="text-red-500 italic">Empty</span>}
                        </td>
                        <td className="py-2 px-3 text-gray-500 dark:text-gray-400">
                          {row.academic_year}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {row.valid ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                              Valid
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400">
                              {row.error}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Status / Error / Success Message */}
          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-start space-x-2.5 ${
                importStatus === "success"
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                  : importStatus === "error"
                  ? "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              {importStatus === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : importStatus === "error" ? (
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              ) : null}
              <p className="flex-1 font-medium leading-relaxed">{statusMessage}</p>
            </div>
          )}

          {/* Progress bar during import */}
          {isImporting && (
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-xs font-semibold text-gray-700 dark:text-gray-300">
                <span>Importing records to database...</span>
                <span>{importProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex items-center justify-between">
          <button
            type="button"
            onClick={handleClose}
            disabled={isImporting}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleImportSubmit}
            disabled={isImporting || validCount === 0 || isProcessingFile}
            className="inline-flex items-center px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isImporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importing ({validCount})...
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Import {validCount > 0 ? `${validCount} Students` : "Students"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
