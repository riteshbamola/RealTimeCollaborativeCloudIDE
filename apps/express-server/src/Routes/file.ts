import express from "express";
import path from 'path';
import fs from 'fs/promises'

const Router= express.Router();


async function generateFileTree(directory:string){

    let nodeId =0;
    
    async function buildTree(currentDir:string, parentPath:string =""){
        const files = await fs.readdir(currentDir);

        const tree=[];
        for(const file of files)
        {
            const filePath= path.join(currentDir,file);
            const relativePath= parentPath ? path.join(parentPath,file):file;
            const stat= await fs.stat(filePath); // stats about file


            //Create node with UniqueID for visualised List

            const node = {
                id: nodeId++,
                name: file,
                checked: 0,
                isOpen: false,
                routeofnode: filePath,
                isDir:false,
                children:[{}],
                childrenCount:0,
                path: relativePath,
                depth: parentPath.split(path.sep).length, // Track nesting level for indentation
                size: stat.size,
                modifiedTime: stat.mtime.getTime()
             };

             if(stat.isDirectory()){
                node.isDir= true;
                node.children = await buildTree(filePath,relativePath);
                node.childrenCount= node.children.length;

             }
             else{
                node.isDir=false;
             }

             tree.push(node);

            }
            
            return tree;
            
        }

        const children=await buildTree(directory);

        return {
            id: nodeId++,
            name: 'root',
            checked: 0,
            isOpen: true,
            children,
            routeofnode: '/',
            path: '',
            depth: 0,
            isDir: true,
            childrenCount: children.length
        };
}

Router.get('/files',async(req,res)=>{
    try{
        const queryParams = new URLSearchParams(req.url?.split("?")[1]);
        const userId = queryParams.get("id")?.toString();

        if(userId == ""){
        return res.json({error:"No userId Found"});
    }

        const userDirectory = path.join(process.env.INIT_CWD || __dirname ,`Dir_${userId}`);
        const fileTree= await generateFileTree(userDirectory);

        const flattenedNode:any =[];

        function flattenTree(node:any, isVisible = true) {
            const nodeInfo = {
              id: node.id,
              name: node.name,
              isDir: node.isDir,
              path: node.path,
              routeofnode: node.routeofnode,
              depth: node.depth,
              isOpen: node.isOpen,
              childrenCount: node.childrenCount,
              isVisible: isVisible
            };
            flattenedNode.push(nodeInfo);
            if (node.isDir && node.isOpen && node.children) {
                for (const child of node.children) {
                    flattenTree(child, isVisible && node.isOpen);
                 }
             }
             flattenTree(fileTree);
             return res.json({ 
                fileTree,
                flattenedNode
            });

        }


    }catch(error){
        console.error(error);
        return res.status(500).json({ error: 'Failed to generate file tree' });
    }
});

Router.post('/files/toggle', express.json(), async (req, res) => {
  try {
    const { path: nodePath } = req.body;
    if (!nodePath) {
      return res.status(400).json({ error: 'Node path is required' });
    }
    const queryParams = new URLSearchParams(req.url?.split("?")[1]);
    const userId = queryParams.get("id")?.toString();

    if(userId == ""){
        return res.json({error:"No userId Found"});
    }

    const userDirectory = path.join(process.env.INIT_CMD || __dirname, `DIR_${userId}`);
    const fileTree = await generateFileTree(userDirectory);
    
    // Find and toggle the specified node
    function toggleNode(node:any) {
      if (node.routeofnode === nodePath) {
        node.isOpen = !node.isOpen;
        return true;
      }
      
      if (node.isDir && node.children) {
        for (const child of node.children) {
          if (toggleNode(child)) {
            return true;
          }
        }
      }
      
      return false;
    }
    
    toggleNode(fileTree);
    
    // Create updated flattened list
    const flattenedNodes:any = [];
    function flattenTree(node:any, isVisible = true) {
      const nodeInfo = {
        id: node.id,
        name: node.name,
        isDir: node.isDir,
        path: node.path,
        routeofnode: node.routeofnode,
        depth: node.depth,
        isOpen: node.isOpen,
        childrenCount: node.childrenCount,
        isVisible: isVisible
      };
      
      flattenedNodes.push(nodeInfo);
      
      if (node.isDir && node.isOpen && node.children) {
        for (const child of node.children) {
          flattenTree(child, isVisible && node.isOpen);
        }
      }
    }
    
    flattenTree(fileTree);
    
    return res.json({ 
      success: true,
      flattenedNodes 
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to toggle directory state' });
  }
});

/**
 * Get file content
 * This endpoint returns the content of a file for editing
 */
Router.get('/files/content', async (req, res) => {
  try {
    const filePath = req.query.path;
    
    
    // Get the file path from query parameter
    if (typeof filePath !== 'string') {
      return res.status(400).json({ error: 'Invalid path parameter' });
    }

    const queryParams = new URLSearchParams(req.url?.split("?")[1]);
    const userId = queryParams.get("id")?.toString();

    if(userId == ""){
        return res.json({error:"No userId Found"});
    }

    const fullpath=path.join(process.env.INIT_CMD || process.cwd(), `DIR_${userId}`, filePath);
 
  
    //  absolute path to read the file

    const content = await fs.readFile(fullpath, 'utf-8');
    // console.log("request from frontend",content);
    
    // Get file metadata for the editor
    const stats = await fs.stat(fullpath);
    const fileInfo = {
      name: path.basename(filePath),
      path: filePath,
      size: stats.size,
      modifiedTime: stats.mtime,
      extension: path.extname(filePath).toLowerCase()
    };
    
    return res.json({ 
      content,
      fileInfo
    });
  } catch (error) {
    console.error('Error reading file:', error);
    return res.status(500).json({ error: 'Error reading file' });
  }
});

/**
 * Create a new file or directory
 * This endpoint creates a new file or directory and returns the updated file tree
 */

Router.post('/files/create', express.json(), async (req, res) => {
  try {
    const { filePath, content, isDirectory } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    const queryParams = new URLSearchParams(req.url?.split("?")[1]);
    const userId = queryParams.get("id")?.toString();

    if(userId == ""){
        return res.json({error:"No userId Found"});
    }
    const userDirectory = path.join(process.env.INIT_CMD || process.cwd(), `DIR_${userId}`);
    const fullPath = path.join(userDirectory, filePath.replace(/^\/+/, ''));
    
    if (isDirectory) {
      await fs.mkdir(fullPath, { recursive: true });
    } else {
      // Ensure parent directory exists

      const parentDir = path.dirname(fullPath);
      await fs.mkdir(parentDir, { recursive: true });
      
      // Create the file with content
      await fs.writeFile(fullPath, content || '');
    }
    
    // Generate updated file tree for React-virtualized
    const fileTree = await generateFileTree(userDirectory);
    
    // Create flattened list for virtualized rendering
    const flattenedNodes:any = [];
    function flattenTree(node:any, isVisible = true) {
      const nodeInfo = {
        id: node.id,
        name: node.name,
        isDir: node.isDir,
        path: node.path,
        routeofnode: node.routeofnode,
        depth: node.depth,
        isOpen: node.isOpen,
        childrenCount: node.childrenCount,
        isVisible: isVisible
      };
      
      flattenedNodes.push(nodeInfo);
      
      if (node.isDir && node.isOpen && node.children) {
        for (const child of node.children) {
          flattenTree(child, isVisible && node.isOpen);
        }
      }
    }
    
    flattenTree(fileTree);
    
    return res.json({ 
      success: true, 
      message: isDirectory ? `Directory created: ${filePath}` : `File created: ${filePath}`,
      fileTree,
      flattenedNodes
    });
  } catch (error) {
    console.error('Error creating file/directory:', error);
    return res.status(500).json({ error: 'Failed to create file/directory' });
  }
});

/**
 * Delete a file or directory
 * This endpoint deletes a file or directory and returns the updated file tree
 */
Router.delete('/files/delete', express.json(), async (req, res) => {
  try {
    const { path: filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    const queryParams = new URLSearchParams(req.url?.split("?")[1]);
    const userId = queryParams.get("id")?.toString();

    if(userId == ""){
        return res.json({error:"No userId Found"});
    }
    // Check if path exists
    try {
      await fs.access(filePath);
    } catch (err) {
      return res.status(404).json({ error: 'File or directory not found' });
    }
    
    // Check if it's a directory
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      await fs.rm(filePath, { recursive: true, force: true });
    } else {
      await fs.unlink(filePath);
    }
    
    // Generate updated file tree
    const userDirectory = path.join(process.env.INIT_CMD || process.cwd(), `DIR_${userId}`);
    const fileTree = await generateFileTree(userDirectory);
    
    // Create flattened list for virtualized rendering
    const flattenedNodes:any = [];
    function flattenTree(node:any, isVisible = true) {
      const nodeInfo = {
        id: node.id,
        name: node.name,
        isDir: node.isDir,
        path: node.path,
        routeofnode: node.routeofnode,
        depth: node.depth,
        isOpen: node.isOpen,
        childrenCount: node.childrenCount,
        isVisible: isVisible
      };
      
      flattenedNodes.push(nodeInfo);
      
      if (node.isDir && node.isOpen && node.children) {
        for (const child of node.children) {
          flattenTree(child, isVisible && node.isOpen);
        }
      }
    }
    
    flattenTree(fileTree);
    
    return res.json({ 
      success: true, 
      message: stats.isDirectory() ? 'Directory deleted' : 'File deleted',
      fileTree,
      flattenedNodes
    });
  } catch (error) {
    console.error('Error deleting file/directory:', error);
    return res.status(500).json({ error: 'Failed to delete file/directory' });
  }
});

module.exports = Router;

