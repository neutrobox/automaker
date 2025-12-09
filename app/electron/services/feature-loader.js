const path = require("path");
const fs = require("fs/promises");

/**
 * Feature Loader - Handles loading and selecting features from feature_list.json
 */
class FeatureLoader {
  /**
   * Load features from .automaker/feature_list.json
   */
  async loadFeatures(projectPath) {
    const featuresPath = path.join(
      projectPath,
      ".automaker",
      "feature_list.json"
    );

    try {
      const content = await fs.readFile(featuresPath, "utf-8");
      const features = JSON.parse(content);

      // Ensure each feature has an ID
      return features.map((f, index) => ({
        ...f,
        id: f.id || `feature-${index}-${Date.now()}`,
      }));
    } catch (error) {
      console.error("[FeatureLoader] Failed to load features:", error);
      return [];
    }
  }

  /**
   * Update feature status in .automaker/feature_list.json
   * @param {string} featureId - The ID of the feature to update
   * @param {string} status - The new status
   * @param {string} projectPath - Path to the project
   * @param {string} [summary] - Optional summary of what was done
   */
  async updateFeatureStatus(featureId, status, projectPath, summary) {
    const features = await this.loadFeatures(projectPath);
    const feature = features.find((f) => f.id === featureId);

    if (!feature) {
      console.error(`[FeatureLoader] Feature ${featureId} not found`);
      return;
    }

    // Update the status field
    feature.status = status;

    // Update the summary field if provided
    if (summary) {
      feature.summary = summary;
    }

    // Save back to file
    const featuresPath = path.join(
      projectPath,
      ".automaker",
      "feature_list.json"
    );
    const toSave = features.map((f) => {
      const featureData = {
        id: f.id,
        category: f.category,
        description: f.description,
        steps: f.steps,
        status: f.status,
      };
      // Preserve optional fields if they exist
      if (f.skipTests !== undefined) {
        featureData.skipTests = f.skipTests;
      }
      if (f.images !== undefined) {
        featureData.images = f.images;
      }
      if (f.imagePaths !== undefined) {
        featureData.imagePaths = f.imagePaths;
      }
      if (f.startedAt !== undefined) {
        featureData.startedAt = f.startedAt;
      }
      if (f.summary !== undefined) {
        featureData.summary = f.summary;
      }
      if (f.model !== undefined) {
        featureData.model = f.model;
      }
      if (f.thinkingLevel !== undefined) {
        featureData.thinkingLevel = f.thinkingLevel;
      }
      return featureData;
    });

    await fs.writeFile(featuresPath, JSON.stringify(toSave, null, 2), "utf-8");
    console.log(`[FeatureLoader] Updated feature ${featureId}: status=${status}${summary ? `, summary="${summary}"` : ""}`);
  }

  /**
   * Select the next feature to implement
   * Prioritizes: earlier features in the list that are not verified or waiting_approval
   */
  selectNextFeature(features) {
    // Find first feature that is in backlog or in_progress status
    // Skip verified and waiting_approval (which needs user input)
    return features.find((f) => f.status !== "verified" && f.status !== "waiting_approval");
  }
}

module.exports = new FeatureLoader();
