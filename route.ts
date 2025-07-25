import { NextResponse } from 'next/server';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import path from 'path';

export async function GET(request: Request) {
  try {
    // Create a stream that will output the ZIP archive
    const archiveStream = new PassThrough();

    // Initialize archiver with ZIP format and maximum compression
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.on('error', (err: Error) => {
      throw err;
    });

    // Pipe archive output to the stream
    archive.pipe(archiveStream);

    // Define the base directory for the project files
    const baseDir = process.cwd();

    // Include all files in the project but ignore node_modules, .git, and other unnecessary directories
    archive.glob('**/*', {
      cwd: baseDir,
      ignore: [
        'node_modules/**',
        '.git/**',
        '.next/**',
        'dist/**',
        'build/**',
        '.DS_Store',
        '*.log',
        '.env*',
        'coverage/**'
      ]
    });

    // Finalize the archive (it returns a Promise)
    await archive.finalize();

    // Return the zipped archive as a streaming response with proper headers
    return new NextResponse(archiveStream as any, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="my-app-project.zip"',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Error creating zip file:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Failed to create ZIP archive' }),
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );
  }
}
