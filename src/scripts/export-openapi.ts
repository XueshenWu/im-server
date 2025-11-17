import { writeFileSync } from 'fs';
import { swaggerSpec } from '../config/swagger';

/**
 * Export OpenAPI specification to JSON file
 */
function exportOpenAPISpec() {
  const outputPath = './openapi.json';

  try {
    // Convert swagger spec to formatted JSON
    const jsonSpec = JSON.stringify(swaggerSpec, null, 2);

    // Write to file
    writeFileSync(outputPath, jsonSpec, 'utf-8');

    console.log('✅ OpenAPI specification exported successfully!');
    console.log(`📄 File: ${outputPath}`);
    console.log(`📊 Endpoints: ${Object.keys(swaggerSpec.paths || {}).length}`);
    console.log(`🏷️  Tags: ${(swaggerSpec.tags || []).length}`);
  } catch (error) {
    console.error('❌ Error exporting OpenAPI spec:', error);
    process.exit(1);
  }
}

// Run export
exportOpenAPISpec();
